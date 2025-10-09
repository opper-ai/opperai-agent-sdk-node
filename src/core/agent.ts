import { z } from "zod";

import {
  AgentDecisionSchema,
  type AgentDecision,
  type ToolExecutionSummary,
  ToolExecutionSummarySchema,
} from "./schemas";
import { BaseAgent, type BaseAgentConfig } from "../base/agent";
import type { AgentContext } from "../base/context";
import { HookEvents } from "../base/hooks";
import type { ToolSuccess } from "../base/tool";
import { OpperClient } from "../opper/client";
import { getDefaultLogger, LogLevel, type AgentLogger } from "../utils/logger";
import { schemaToJson } from "../utils/schema-utils";

const isToolSuccessResult = (value: unknown): value is ToolSuccess<unknown> => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ToolSuccess<unknown>>;
  return (
    candidate.success === true &&
    typeof candidate.toolName === "string" &&
    "output" in candidate
  );
};

/**
 * Configuration for the core Agent
 */
export interface AgentConfig<TInput, TOutput>
  extends BaseAgentConfig<TInput, TOutput> {
  /**
   * Custom Opper client instance (for testing or custom configuration)
   */
  opperClient?: OpperClient;

  /**
   * Logger instance
   */
  logger?: AgentLogger;

  /**
   * Verbose logging
   */
  verbose?: boolean;
}

/**
 * Core Agent implementation with "while tools > 0" loop.
 * Implements think → tool execution → memory handling cycle.
 */
export class Agent<TInput = unknown, TOutput = unknown> extends BaseAgent<
  TInput,
  TOutput
> {
  private readonly opperClient: OpperClient;
  private readonly logger: AgentLogger;
  private readonly verbose: boolean;

  constructor(config: AgentConfig<TInput, TOutput>) {
    super(config);

    this.logger = config.logger ?? getDefaultLogger();
    this.verbose = config.verbose ?? false;

    // If verbose mode is enabled, ensure the logger emits info-level logs
    if (this.verbose) {
      try {
        this.logger.setLevel?.(LogLevel.INFO);
      } catch {
        // Ignore if the provided logger does not support dynamic level changes
      }
    }

    // Initialize Opper client
    this.opperClient =
      config.opperClient ??
      new OpperClient(this.opperConfig.apiKey, {
        logger: this.logger,
      });
  }

  /**
   * Serialize input for passing to LLM or spans
   */
  private serializeInput(input: TInput): string {
    if (typeof input === "string") {
      return input;
    }
    if (typeof input === "object" && input !== null) {
      return JSON.stringify(input);
    }
    return String(input);
  }

  /**
   * Main agent loop: think → tool execution → memory handling → repeat until complete
   */
  protected async runLoop(
    input: TInput,
    context: AgentContext,
  ): Promise<TOutput> {
    this.log("Starting agent loop", {
      goal: input,
      maxIterations: this.maxIterations,
      tools: Array.from(this.tools.keys()),
    });

    // Create parent span for this agent execution
    const parentSpan = await this.opperClient.createSpan({
      name: `${this.name}_execution`,
      input: this.serializeInput(input),
      ...(context.parentSpanId ? { parentSpanId: context.parentSpanId } : {}),
    });
    context.parentSpanId = parentSpan.id;

    try {
      while (context.iteration < this.maxIterations) {
        const currentIteration = context.iteration + 1;

        this.log(`Iteration ${currentIteration}/${this.maxIterations}`, {
          toolsAvailable: this.tools.size,
        });

        // Hook: loop_start
        await this.triggerHook(HookEvents.LoopStart, { context });

        let loopComplete = false;

        try {
          // Step 1: Think - Get agent's decision
          const { decision, spanId: thinkSpanId } = await this.think(
            input,
            context,
          );

          // Step 2: Handle memory actions (Phase 7 integration point)
          const memoryResults = await this.handleMemoryActions(
            decision,
            context,
            thinkSpanId,
          );

          // Track tool call records captured during this iteration
          const toolCallStartIndex = context.toolCalls.length;

          // Step 3: Execute tool calls (if any)
          const toolResults = await this.executeToolCalls(
            decision,
            context,
            thinkSpanId,
          );
          const combinedResults = [...memoryResults, ...toolResults];

          const newToolCalls = context.toolCalls.slice(toolCallStartIndex);

          // Step 4: Record execution cycle (always capture reasoning per iteration)
          context.addCycle({
            iteration: currentIteration,
            thought: {
              reasoning: decision.reasoning,
              memoryReads: decision.memoryReads,
              memoryUpdates: decision.memoryUpdates,
            },
            toolCalls: newToolCalls,
            results: combinedResults,
            timestamp: Date.now(),
          });
          context.iteration = currentIteration;

          // Check if loop is complete
          const hasToolCalls = decision.toolCalls.length > 0;
          const hasMemoryReads =
            this.enableMemory && (decision.memoryReads?.length ?? 0) > 0;
          loopComplete = !hasToolCalls && !hasMemoryReads;
        } finally {
          // Hook: loop_end
          await this.triggerHook(HookEvents.LoopEnd, { context });
        }

        // Exit loop if complete
        if (loopComplete) {
          this.log("Loop complete, generating final result", {
            iteration: context.iteration + 1,
          });
          break;
        }
      }

      // Check if we exceeded max iterations without completing
      if (context.iteration >= this.maxIterations) {
        throw new Error(
          `Agent exceeded maximum iterations (${this.maxIterations}) without completing the task`,
        );
      }

      // Generate final result
      const result = await this.generateFinalResult(input, context);

      // Update parent span with final output
      await this.opperClient.updateSpan(parentSpan.id, result);

      return result;
    } catch (error) {
      // Update parent span with error
      await this.opperClient.updateSpan(parentSpan.id, undefined, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Think step: Call LLM to decide next action
   */
  private async think(
    input: TInput,
    context: AgentContext,
  ): Promise<{ decision: AgentDecision; spanId: string }> {
    const spanName = "think";
    this.log("Think step", { iteration: context.iteration });

    // Trigger hook: llm_call
    await this.triggerHook(HookEvents.LlmCall, { context, callType: "think" });

    try {
      // Build static instructions
      const instructions = this.buildThinkInstructions();

      // Build dynamic context (execution history, tools, memory, etc.)
      const thinkContext = await this.buildThinkContext(input, context);

      // Call Opper with structured output
      const response = await this.opperClient.call<
        typeof thinkContext,
        AgentDecision
      >({
        name: spanName,
        instructions,
        input: thinkContext,
        outputSchema: AgentDecisionSchema as z.ZodType<AgentDecision>,
        model: this.model,
        ...(context.parentSpanId && { parentSpanId: context.parentSpanId }),
      });

      // Update usage
      context.updateUsage({
        requests: 1,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        totalTokens: response.usage.totalTokens,
        cost: response.usage.cost,
      });

      // Parse and validate decision
      const decision = AgentDecisionSchema.parse(response.jsonPayload);

      // Trigger hook: llm_response
      await this.triggerHook(HookEvents.LlmResponse, {
        context,
        callType: "think",
        response,
      });

      // Trigger hook: think_end
      await this.triggerHook(HookEvents.ThinkEnd, {
        context,
        thought: { reasoning: decision.reasoning },
      });

      this.log("Think result", {
        reasoning: decision.reasoning,
        toolCalls: decision.toolCalls.length,
        memoryReads: decision.memoryReads?.length ?? 0,
        memoryWrites: Object.keys(decision.memoryUpdates ?? {}).length,
      });

      return { decision, spanId: response.spanId };
    } catch (error) {
      this.logger.error("Think step failed", error);
      throw new Error(
        `Think step failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Build static instructions for the think step
   */
  private buildThinkInstructions(): string {
    let instructions = `You are in a Think-Act reasoning loop.

YOUR TASK:
1. Analyze the current situation
2. Decide if the goal is complete or more actions are needed
3. If more actions needed: specify tools to call
4. If goal complete: return empty tool_calls list

IMPORTANT:
- Return empty toolCalls array when task is COMPLETE
- Only use available tools
- Provide clear reasoning for each decision`;

    // Add memory instructions if enabled
    if (this.enableMemory) {
      instructions += `

MEMORY SYSTEM:
You have access to a persistent memory system that works across iterations.

Memory Operations:
1. READ: Add keys to memoryReads when you need to load existing entries
2. WRITE: Populate memoryUpdates with key-value pairs (with optional description/metadata)
   Example: memoryUpdates = { "favorite_color": { "value": "blue", "description": "User likes blue" } }

When to use memory:
- Save important calculations, decisions, or user preferences
- Load memory when you need information from earlier in the conversation
- Use descriptive keys like "budget_total", "user_favorite_city", etc.
- When a key appears in memory_catalog and you need its value, add it to memoryReads before continuing

The memory you write persists across all process() calls on this agent.`;
    }

    return instructions;
  }

  /**
   * Build dynamic context for the think step
   */
  private async buildThinkContext(input: TInput, context: AgentContext) {
    // Build available tools list
    const availableTools = Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description || "",
      // Convert Zod schema to JSON Schema for LLM consumption
      parameters: tool.schema ? schemaToJson(tool.schema) : {},
    }));

    // Build execution history
    const executionHistory = context.getLastNCycles(3).map((cycle) => {
      // Extract reasoning from thought
      const thought =
        typeof cycle.thought === "object" && cycle.thought !== null
          ? ((cycle.thought as Record<string, unknown>)[
              "reasoning"
            ] as string) || ""
          : String(cycle.thought || "");

      // Map results to summary format
      const results = Array.isArray(cycle.results)
        ? cycle.results.map((r) => {
            const result = r as ToolExecutionSummary;

            // Extract the actual output value - handle case where output might be a ToolResult object
            let actualOutput = result.output;
            if (result.success && isToolSuccessResult(actualOutput)) {
              // Extract inner output when a full ToolResult is stored
              actualOutput = actualOutput.output;
            }

            return {
              tool: result.toolName,
              success: result.success,
              // Serialize result properly - use JSON for objects, String for primitives
              result: result.success
                ? typeof actualOutput === "object"
                  ? JSON.stringify(actualOutput)
                  : String(actualOutput)
                : undefined,
              error: !result.success ? result.error : undefined,
            };
          })
        : [];

      return {
        iteration: cycle.iteration,
        thought,
        results,
      };
    });

    // Build memory catalog if memory is enabled and has entries
    let memoryCatalog: unknown = null;
    if (this.enableMemory && this.memory && (await this.memory.hasEntries())) {
      memoryCatalog = await this.memory.listEntries();
    }

    // Get loaded memory from context metadata
    const loadedMemory = context.metadata["current_memory"] ?? null;

    // Build context object
    return {
      goal: this.serializeInput(input),
      agent_description: this.description || "",
      instructions: this.instructions || "No specific instructions.",
      available_tools: availableTools,
      execution_history: executionHistory,
      current_iteration: context.iteration + 1,
      max_iterations: this.maxIterations,
      memory_catalog: memoryCatalog,
      loaded_memory: loadedMemory,
    };
  }

  /**
   * Execute all tool calls from a decision
   */
  private async executeToolCalls(
    decision: AgentDecision,
    context: AgentContext,
    parentSpanId?: string,
  ): Promise<ToolExecutionSummary[]> {
    if (decision.toolCalls.length === 0) {
      return [];
    }

    this.log(`Executing ${decision.toolCalls.length} tool call(s)`);

    const results: ToolExecutionSummary[] = [];

    for (const toolCall of decision.toolCalls) {
      // Verbose: announce the tool and parameters
      this.log(`Action: ${toolCall.toolName}`, {
        parameters: toolCall.arguments,
      });

      // Create span for this tool call
      const toolSpan = await this.opperClient.createSpan({
        name: `tool_${toolCall.toolName}`,
        input: toolCall.arguments,
        ...(parentSpanId
          ? { parentSpanId }
          : context.parentSpanId
            ? { parentSpanId: context.parentSpanId }
            : {}),
      });

      try {
        // Execute tool via base class method (handles hooks and recording)
        // Pass tool span ID so nested operations can use it as parent
        const result = await this.executeTool(
          toolCall.toolName,
          toolCall.arguments,
          context,
          { spanId: toolSpan.id },
        );

        // Update tool span with result
        if (result.success) {
          await this.opperClient.updateSpan(toolSpan.id, result.output);
        } else {
          await this.opperClient.updateSpan(toolSpan.id, undefined, {
            error:
              result.error instanceof Error
                ? result.error.message
                : String(result.error),
          });
        }

        // Create summary
        const summary: ToolExecutionSummary = {
          toolName: toolCall.toolName,
          success: result.success,
          ...(result.success && { output: result.output }),
          ...(!result.success && {
            error:
              result.error instanceof Error
                ? result.error.message
                : String(result.error),
          }),
        };

        results.push(ToolExecutionSummarySchema.parse(summary));

        this.log(
          `Tool ${toolCall.toolName} ${result.success ? "succeeded" : "failed"}`,
          {
            success: result.success,
          },
        );
      } catch (error) {
        // Update span with error
        await this.opperClient.updateSpan(toolSpan.id, undefined, {
          error: error instanceof Error ? error.message : String(error),
        });

        // Tool execution threw an error
        const summary: ToolExecutionSummary = {
          toolName: toolCall.toolName,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };

        results.push(ToolExecutionSummarySchema.parse(summary));

        this.logger.warn(`Tool ${toolCall.toolName} threw error`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Handle memory operations from a decision
   * Supports read and write operations with graceful degradation
   */
  private async handleMemoryActions(
    decision: AgentDecision,
    context: AgentContext,
    parentSpanId?: string,
  ): Promise<ToolExecutionSummary[]> {
    if (!this.enableMemory || !this.memory) {
      return [];
    }

    const hasReads =
      Array.isArray(decision.memoryReads) && decision.memoryReads.length > 0;
    const updateEntries = Object.entries(decision.memoryUpdates ?? {}).filter(
      ([key, update]) =>
        typeof key === "string" &&
        key.length > 0 &&
        typeof update === "object" &&
        update !== null &&
        "value" in update,
    );
    const hasWrites = updateEntries.length > 0;

    if (!hasReads && !hasWrites) {
      return [];
    }

    this.log("Handling memory operations", {
      reads: decision.memoryReads?.length ?? 0,
      writes: updateEntries.length,
    });

    const spanParentId = parentSpanId ?? context.parentSpanId ?? undefined;
    const summaries: ToolExecutionSummary[] = [];

    // Handle reads first
    if (hasReads) {
      try {
        const keySet = new Set(
          decision.memoryReads.filter(
            (key): key is string => typeof key === "string" && key.length > 0,
          ),
        );
        const keys = Array.from(keySet);

        if (keys.length > 0) {
          const memoryReadSpan = await this.opperClient.createSpan({
            name: "memory_read",
            input: keys,
            ...(spanParentId && { parentSpanId: spanParentId }),
          });

          const memoryData = await this.memory.read(keys);

          await this.opperClient.updateSpan(memoryReadSpan.id, memoryData);

          // Store loaded memory in context metadata
          context.setMetadata("current_memory", memoryData);

          this.log(`Loaded ${Object.keys(memoryData).length} memory entries`, {
            keys,
          });

          summaries.push(
            ToolExecutionSummarySchema.parse({
              toolName: "memory_read",
              success: true,
              output: { keys, data: memoryData },
            }),
          );

          // Trigger hooks for each read
          for (const key of keys) {
            await this.triggerHook(HookEvents.MemoryRead, {
              context,
              key,
              value: memoryData[key],
            });
          }
        }
      } catch (error) {
        await this.triggerHook(HookEvents.MemoryError, {
          context,
          operation: "read",
          error,
        });

        this.logger.warn("Memory read failed", {
          error: error instanceof Error ? error.message : String(error),
        });

        summaries.push(
          ToolExecutionSummarySchema.parse({
            toolName: "memory_read",
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }

    // Handle writes
    if (hasWrites) {
      try {
        const memoryWriteSpan = await this.opperClient.createSpan({
          name: "memory_write",
          input: updateEntries.map(([key]) => key),
          ...(spanParentId && { parentSpanId: spanParentId }),
        });

        for (const [key, update] of updateEntries) {
          const castUpdate = update as {
            value: unknown;
            description?: string;
            metadata?: Record<string, unknown>;
          };

          await this.memory.write(
            key,
            castUpdate.value,
            castUpdate.description ?? key,
            castUpdate.metadata,
          );

          await this.triggerHook(HookEvents.MemoryWrite, {
            context,
            key,
            value: castUpdate.value,
          });
        }

        await this.opperClient.updateSpan(
          memoryWriteSpan.id,
          `Successfully wrote ${updateEntries.length} keys`,
        );

        this.log(`Wrote ${updateEntries.length} memory entries`);

        summaries.push(
          ToolExecutionSummarySchema.parse({
            toolName: "memory_write",
            success: true,
            output: {
              keys: updateEntries.map(([key]) => key),
            },
          }),
        );
      } catch (error) {
        await this.triggerHook(HookEvents.MemoryError, {
          context,
          operation: "write",
          error,
        });

        this.logger.warn("Memory write failed", {
          error: error instanceof Error ? error.message : String(error),
        });

        summaries.push(
          ToolExecutionSummarySchema.parse({
            toolName: "memory_write",
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }

    return summaries;
  }

  /**
   * Generate final result based on execution history
   */
  private async generateFinalResult(
    input: TInput,
    context: AgentContext,
  ): Promise<TOutput> {
    this.log("Generating final result", { totalIterations: context.iteration });

    // Build context for final result generation
    const finalContext = {
      goal: this.serializeInput(input),
      instructions: this.instructions || "No specific instructions.",
      execution_history: context.executionHistory.map((cycle) => {
        const results = Array.isArray(cycle.results) ? cycle.results : [];
        return {
          iteration: cycle.iteration,
          actions_taken: results.map(
            (r) => (r as ToolExecutionSummary).toolName,
          ),
          results: results
            .filter((r) => (r as ToolExecutionSummary).success)
            .map((r) => {
              const result = r as ToolExecutionSummary;

              // Extract the actual output value - handle case where output might be a ToolResult object
              let actualOutput = result.output;
              if (isToolSuccessResult(actualOutput)) {
                // Extract inner output when a full ToolResult is stored
                actualOutput = actualOutput.output;
              }

              return {
                tool: result.toolName,
                // Serialize result properly - use JSON for objects, String for primitives
                result:
                  typeof actualOutput === "object"
                    ? JSON.stringify(actualOutput)
                    : String(actualOutput),
              };
            }),
        };
      }),
      total_iterations: context.iteration,
    };

    const instructions = `Generate the final result based on the execution history.
Follow any instructions provided for formatting and style.`;

    try {
      // Call Opper to generate final result
      const callOptions: {
        name: string;
        instructions: string;
        input: typeof finalContext;
        model: string | readonly string[];
        parentSpanId?: string;
        outputSchema?: z.ZodType<TOutput>;
      } = {
        name: "generate_final_result",
        instructions,
        input: finalContext,
        model: this.model,
      };

      if (context.parentSpanId) {
        callOptions.parentSpanId = context.parentSpanId;
      }

      if (this.outputSchema) {
        callOptions.outputSchema = this.outputSchema;
      }

      const response = await this.opperClient.call<
        typeof finalContext,
        TOutput
      >(callOptions);

      // Update usage
      context.updateUsage({
        requests: 1,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        totalTokens: response.usage.totalTokens,
        cost: response.usage.cost,
      });

      // Parse and return result
      if (this.outputSchema) {
        // With output schema, Opper returns jsonPayload
        const parsed = this.outputSchema.parse(response.jsonPayload) as TOutput;
        this.log("Final result generated (schema-validated)");
        return parsed;
      }

      // Without output schema, Opper returns message
      this.log("Final result generated");
      return response.message as TOutput;
    } catch (error) {
      this.logger.error("Failed to generate final result", error);
      throw new Error(
        `Failed to generate final result: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Log helper
   */
  private log(message: string, data?: Record<string, unknown>): void {
    if (this.verbose) {
      this.logger.info(`[${this.name}] ${message}`, data);
    }
  }
}
