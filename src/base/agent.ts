import type { ZodType } from "zod";

import type { AgentContext } from "./context";
import {
  AgentEventEmitter,
  type AgentEventListener,
  type AgentEventName,
  type AgentEventPayload,
} from "./events";
import {
  HookEvents,
  HookManager,
  type HookEventName,
  type HookHandler,
} from "./hooks";
import type {
  Tool,
  ToolExecutionContext,
  ToolResult,
  ToolProvider,
} from "./tool";
import {
  ToolResultFactory,
  coerceToolDefinition,
  normalizeToolEntries,
} from "./tool";
import {
  generateAgentFlowDiagram,
  type VisualizationOptions,
} from "./visualization";
import type { Memory } from "../memory/memory";
import { InMemoryStore } from "../memory/memory";

//Default model:
export const DEFAULT_MODEL = "gcp/gemini-flash-latest";

/**
 * Configuration options for BaseAgent
 */
export interface BaseAgentConfig<TInput, TOutput> {
  /**
   * Unique name identifying this agent
   */
  name: string;

  /**
   * Human-readable description of the agent's purpose
   */
  description?: string;

  /**
   * System instructions guiding agent behavior
   */
  instructions?: string;

  /**
   * List of tools available to the agent
   *
   * We intentionally accept Tool<any, any> here because tool inputs are ultimately validated
   * at runtime before execution. Using `any` keeps the API ergonomic for tool authors while
   * allowing the BaseAgent to store mixed tool definitions in a single registry.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: Array<Tool<any, any> | ToolProvider>;

  /**
   * Maximum iterations before terminating the agent loop
   * @default 25
   */
  maxIterations?: number;

  /**
   * Model identifier(s).
   * Accepts a single model (e.g., "gpt-4", "claude-3-sonnet") or a list used as fallback.
   * @default "gcp/gemini-flash-latest"
   */
  model?: string | readonly string[];

  /**
   * Input schema for validation (Zod schema)
   */
  inputSchema?: ZodType<TInput>;

  /**
   * Output schema for validation (Zod schema)
   */
  outputSchema?: ZodType<TOutput>;

  /**
   * Enable Opper streaming APIs for LLM calls
   * @default false
   */
  enableStreaming?: boolean;

  /**
   * Register a handler invoked when a streaming call starts.
   */
  onStreamStart?: AgentEventListener<typeof HookEvents.StreamStart>;

  /**
   * Register a handler invoked for each streaming chunk.
   */
  onStreamChunk?: AgentEventListener<typeof HookEvents.StreamChunk>;

  /**
   * Register a handler invoked when a streaming call ends.
   */
  onStreamEnd?: AgentEventListener<typeof HookEvents.StreamEnd>;

  /**
   * Register a handler invoked when streaming encounters an error.
   */
  onStreamError?: AgentEventListener<typeof HookEvents.StreamError>;

  /**
   * Enable memory subsystem
   * @default false
   */
  enableMemory?: boolean;

  /**
   * Custom memory implementation (defaults to InMemoryStore if enableMemory is true)
   */
  memory?: Memory;

  /**
   * Additional metadata for the agent
   */
  metadata?: Record<string, unknown>;

  /**
   * Opper API configuration
   */
  opperConfig?: OpperClientConfig;
}

/**
 * Opper client configuration
 */
export interface OpperClientConfig {
  /**
   * Opper API key (defaults to process.env.OPPER_API_KEY)
   */
  apiKey: string | undefined;

  /**
   * Opper API base URL
   */
  baseUrl: string | undefined;

  /**
   * Additional configuration options
   */
  [key: string]: unknown;
}

/**
 * Abstract base class for all Opper agents.
 * Provides lifecycle management, tool handling, hook system, and Opper integration.
 *
 * @template TInput - Type of input the agent accepts
 * @template TOutput - Type of output the agent produces
 */
export abstract class BaseAgent<TInput = unknown, TOutput = unknown> {
  /**
   * Agent name
   */
  public readonly name: string;

  /**
   * Agent description
   */
  public readonly description: string | undefined;

  /**
   * Agent instructions
   */
  public readonly instructions: string | undefined;

  /**
   * Maximum iterations for the agent loop
   */
  public readonly maxIterations: number;

  /**
   * Model identifier
   */
  public readonly model: string | readonly string[];

  /**
   * Input validation schema
   */
  public readonly inputSchema: ZodType<TInput> | undefined;

  /**
   * Output validation schema
   */
  public readonly outputSchema: ZodType<TOutput> | undefined;

  /**
   * Whether memory is enabled
   */
  public readonly enableMemory: boolean;

  /**
   * Whether streaming is enabled
   */
  public readonly enableStreaming: boolean;

  /**
   * Memory instance for persistent storage (null if disabled or initialization failed)
   */
  public readonly memory: Memory | null;

  /**
   * Agent metadata
   */
  public readonly metadata: Record<string, unknown>;

  /**
   * Hook manager for lifecycle events
   */
  protected readonly hooks: HookManager;

  /**
   * Event dispatcher for runtime events (notably streaming)
   */
  protected readonly events: AgentEventEmitter;

  /**
   * Registry of available tools
   */
  protected readonly tools: Map<string, Tool<unknown, unknown>>;

  /**
   * Baseline tools registered directly on the agent
   */
  protected readonly baseTools: Map<string, Tool<unknown, unknown>>;

  /**
   * Registered tool providers that can expand into tools at runtime
   */
  protected readonly toolProviders: Set<ToolProvider>;

  /**
   * Active tools supplied by providers for the current execution
   */
  private readonly providerToolRegistry: Map<
    ToolProvider,
    Array<Tool<unknown, unknown>>
  >;

  /**
   * Opper client configuration
   */
  protected readonly opperConfig: OpperClientConfig;

  /**
   * Creates a new BaseAgent instance
   *
   * @param config - Agent configuration object
   * @param config.name - Unique name identifying this agent (required)
   * @param config.description - Human-readable description of the agent's purpose
   * @param config.instructions - System instructions guiding agent behavior
   * @param config.tools - Array of tools or tool providers available to the agent
   * @param config.maxIterations - Maximum iterations before terminating the agent loop (default: 25)
   * @param config.model - Model identifier(s). Single model or array for fallback (default: "gcp/gemini-flash-latest")
   * @param config.inputSchema - Zod schema for input validation
   * @param config.outputSchema - Zod schema for output validation
   * @param config.enableStreaming - Enable Opper streaming APIs for LLM calls (default: false)
   * @param config.enableMemory - Enable memory subsystem (default: false)
   * @param config.memory - Custom memory implementation (defaults to InMemoryStore if enableMemory is true)
   * @param config.metadata - Additional metadata for the agent
   * @param config.opperConfig - Opper API configuration containing apiKey and baseUrl
   * @param config.onStreamStart - Handler invoked when a streaming call starts
   * @param config.onStreamChunk - Handler invoked for each streaming chunk
   * @param config.onStreamEnd - Handler invoked when a streaming call ends
   * @param config.onStreamError - Handler invoked when streaming encounters an error
   */
  constructor(config: BaseAgentConfig<TInput, TOutput>) {
    this.name = config.name;
    this.description = config.description;
    this.instructions = config.instructions;
    this.maxIterations = config.maxIterations ?? 25;
    this.model = config.model ?? DEFAULT_MODEL;
    this.inputSchema = config.inputSchema;
    this.outputSchema = config.outputSchema;
    this.enableMemory = config.enableMemory ?? false;
    this.enableStreaming = config.enableStreaming ?? false;
    this.metadata = { ...(config.metadata ?? {}) };

    this.hooks = new HookManager();
    this.events = new AgentEventEmitter();
    this.tools = new Map();
    this.baseTools = new Map();
    this.toolProviders = new Set();
    this.providerToolRegistry = new Map();

    if (config.onStreamStart) {
      this.on(HookEvents.StreamStart, config.onStreamStart);
    }
    if (config.onStreamChunk) {
      this.on(HookEvents.StreamChunk, config.onStreamChunk);
    }
    if (config.onStreamEnd) {
      this.on(HookEvents.StreamEnd, config.onStreamEnd);
    }
    if (config.onStreamError) {
      this.on(HookEvents.StreamError, config.onStreamError);
    }

    // Initialize Opper configuration with environment fallback
    this.opperConfig = {
      apiKey: config.opperConfig?.apiKey ?? process.env["OPPER_API_KEY"],
      baseUrl: config.opperConfig?.baseUrl,
      ...config.opperConfig,
    };

    // Initialize memory with graceful degradation
    this.memory = this.initializeMemory(config);

    // Register initial tools/providers
    if (config.tools) {
      this.registerTools(config.tools);
    }
  }

  /**
   * Initialize memory subsystem with graceful degradation
   *
   * @param config - Agent configuration
   * @returns Memory instance or null
   */
  private initializeMemory(
    config: BaseAgentConfig<TInput, TOutput>,
  ): Memory | null {
    // If memory disabled, return null
    if (!this.enableMemory && !config.memory) {
      return null;
    }

    try {
      // Use provided memory implementation or default to InMemoryStore
      return config.memory ?? new InMemoryStore();
    } catch (error) {
      // Log warning but don't throw - graceful degradation
      console.warn(
        `[${this.name}] Memory initialization failed, continuing without memory:`,
        error,
      );
      return null;
    }
  }

  /**
   * Main entry point for agent execution.
   * Orchestrates lifecycle: context initialization, hook triggering, loop execution, teardown.
   *
   * @param input - Input to process
   * @param parentSpanId - Optional parent span ID for tracing
   * @returns Processed output
   */
  public async process(input: TInput, parentSpanId?: string): Promise<TOutput> {
    // Validate input if schema provided
    const validatedInput = this.inputSchema
      ? this.inputSchema.parse(input)
      : input;

    // Initialize context
    const context = await this.initializeContext(validatedInput, parentSpanId);

    try {
      await this.activateToolProviders();

      // Trigger agent:start hook
      await this.triggerHook(HookEvents.AgentStart, { context });

      // Execute agent loop
      const result = await this.runLoop(validatedInput, context);

      // Validate output if schema provided
      const validatedOutput = this.outputSchema
        ? this.outputSchema.parse(result)
        : result;

      // Trigger agent:end hook (success)
      await this.triggerHook(HookEvents.AgentEnd, {
        context,
        result: validatedOutput,
      });

      return validatedOutput;
    } catch (error) {
      // Trigger agent:end hook (error)
      await this.triggerHook(HookEvents.AgentEnd, {
        context,
        error,
      });

      throw error;
    } finally {
      await this.deactivateToolProviders();
      // Teardown context
      await this.teardownContext(context);
    }
  }

  /**
   * Abstract method implementing the agent's main loop logic.
   * Must be implemented by concrete agent classes.
   *
   * @param input - Validated input
   * @param context - Agent execution context
   * @returns Processed output
   */
  protected abstract runLoop(
    input: TInput,
    context: AgentContext,
  ): Promise<TOutput>;

  /**
   * Initialize agent context before execution.
   * Can be overridden for custom initialization logic.
   *
   * @param input - Agent input
   * @param parentSpanId - Optional parent span ID
   * @returns Initialized context
   */
  protected async initializeContext(
    input: TInput,
    parentSpanId?: string,
  ): Promise<AgentContext> {
    const context = new (await import("./context")).AgentContext({
      agentName: this.name,
      parentSpanId: parentSpanId ?? null,
      goal: input,
      metadata: { ...this.metadata },
    });

    return context;
  }

  /**
   * Teardown agent context after execution.
   * Can be overridden for custom cleanup logic.
   *
   * @param context - Agent context to teardown
   */
  protected async teardownContext(context: AgentContext): Promise<void> {
    // Default: no-op, subclasses can override for cleanup
    void context;
  }

  /**
   * Add a tool to the agent's tool registry.
   *
   * @param tool - Tool to add
   */
  public addTool<TInput = unknown, TOutput = unknown>(
    tool: Tool<TInput, TOutput>,
  ): void {
    const coerced = coerceToolDefinition(tool);

    if (this.tools.has(coerced.name)) {
      console.warn(
        `[${this.name}] Tool "${coerced.name}" already registered. Overwriting existing definition.`,
      );
    }

    const typedTool = coerced as Tool<unknown, unknown>;
    this.baseTools.set(coerced.name, typedTool);
    this.tools.set(coerced.name, typedTool);
  }

  /**
   * Remove a tool from the agent's tool registry.
   *
   * @param toolName - Name of tool to remove
   * @returns True if tool was removed, false if not found
   */
  public removeTool(toolName: string): boolean {
    this.baseTools.delete(toolName);
    return this.tools.delete(toolName);
  }

  /**
   * Get a tool by name.
   *
   * @param toolName - Name of tool to retrieve
   * @returns Tool instance or undefined
   */
  public getTool(toolName: string): Tool<unknown, unknown> | undefined {
    return this.tools.get(toolName);
  }

  /**
   * Get all registered tools.
   *
   * @returns Array of all tools
   */
  public getTools(): Array<Tool<unknown, unknown>> {
    return Array.from(this.tools.values());
  }

  /**
   * Register a tool provider that expands into tools at runtime.
   *
   * @param provider - Tool provider to add
   */
  public addToolProvider(provider: ToolProvider): void {
    this.toolProviders.add(provider);
  }

  /**
   * Convert this agent into a tool that can be used by other agents.
   *
   * @param toolName - Optional custom name for the tool (defaults to agent name)
   * @param toolDescription - Optional custom description (defaults to agent description)
   * @returns Tool wrapping this agent
   */
  public asTool(
    toolName?: string,
    toolDescription?: string,
  ): Tool<TInput, TOutput> {
    const tool: Tool<TInput, TOutput> = {
      name: toolName ?? this.name,
      description: toolDescription ?? this.description ?? `Agent: ${this.name}`,
      ...(this.inputSchema && { schema: this.inputSchema }),
      metadata: {
        isAgent: true,
        agentName: this.name,
        wrappedAgent: this, // Store reference to this agent for visualization
      },
      execute: async (
        input: TInput,
        executionContext: ToolExecutionContext,
      ): Promise<ToolResult<TOutput>> => {
        try {
          // Use the tool's span ID as parent for nested agent
          const parentSpanId =
            executionContext.spanId ??
            executionContext.agentContext.parentSpanId ??
            undefined;
          const result = await this.process(input, parentSpanId);
          return ToolResultFactory.success(tool.name, result);
        } catch (error) {
          return ToolResultFactory.failure(
            tool.name,
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      },
    };

    return tool;
  }

  /**
   * Register a hook handler for a specific event.
   *
   * @param event - Hook event name
   * @param handler - Hook handler function
   * @returns Cleanup function to unregister the hook
   */
  public registerHook<E extends HookEventName>(
    event: E,
    handler: HookHandler<E>,
  ): () => void {
    return this.hooks.on(event, handler);
  }

  /**
   * Register an event listener.
   *
   * @param event - Event name
   * @param listener - Listener callback
   * @returns Cleanup function to unregister the listener
   */
  public on<E extends AgentEventName>(
    event: E,
    listener: AgentEventListener<E>,
  ): () => void {
    return this.events.on(event, listener);
  }

  /**
   * Register a one-time event listener that removes itself after the first call.
   *
   * @param event - Event name
   * @param listener - Listener callback
   * @returns Cleanup function (no-op once listener fires)
   */
  public once<E extends AgentEventName>(
    event: E,
    listener: AgentEventListener<E>,
  ): () => void {
    return this.events.once(event, listener);
  }

  /**
   * Remove a previously registered event listener.
   *
   * @param event - Event name
   * @param listener - Listener callback to remove
   */
  public off<E extends AgentEventName>(
    event: E,
    listener: AgentEventListener<E>,
  ): void {
    this.events.off(event, listener);
  }

  /**
   * Trigger a hook event with a payload.
   * Swallows errors to prevent hook failures from breaking agent execution.
   *
   * @param event - Hook event name
   * @param payload - Event payload
   */
  protected async triggerHook<E extends HookEventName>(
    event: E,
    payload: Parameters<HookHandler<E>>[0],
  ): Promise<void> {
    try {
      await this.hooks.emit(event, payload);
    } catch (error) {
      // Log but don't throw - hook failures shouldn't break agent execution
      console.warn(`Hook error for event ${event}:`, error);
    }
  }

  /**
   * Emit a runtime event to listeners.
   *
   * @param event - Event name
   * @param payload - Event payload
   */
  protected emitAgentEvent<E extends AgentEventName>(
    event: E,
    payload: AgentEventPayload<E>,
  ): void {
    this.events.emit(event, payload);
  }

  /**
   * Execute a tool with proper context, hooks, and error handling.
   *
   * @param toolName - Name of tool to execute
   * @param input - Tool input
   * @param context - Agent context
   * @param options - Optional execution options (signal, span ID)
   * @returns Tool execution result
   */
  protected async executeTool(
    toolName: string,
    input: unknown,
    context: AgentContext,
    options?: { signal?: AbortSignal; spanId?: string },
  ): Promise<ToolResult<unknown>> {
    const tool = this.tools.get(toolName);

    if (!tool) {
      const failure = ToolResultFactory.failure(
        toolName,
        new Error(`Tool "${toolName}" not found in agent registry`),
      );

      const timestamp = Date.now();

      context.recordToolCall({
        toolName,
        input,
        success: false,
        error:
          failure.error instanceof Error
            ? failure.error.message
            : String(failure.error),
        startedAt: timestamp,
        finishedAt: timestamp,
        metadata: {},
      });

      await this.triggerHook(HookEvents.ToolError, {
        context,
        toolName,
        error: failure.error,
      });

      return failure;
    }

    const executionContext: ToolExecutionContext = {
      agentContext: context,
      ...(options?.signal && { signal: options.signal }),
      ...(options?.spanId && { spanId: options.spanId }),
      metadata: {},
    };

    const startedAt = Date.now();

    try {
      // Trigger before-tool hook
      await this.triggerHook(HookEvents.BeforeTool, {
        context,
        tool,
        input,
      });

      // Execute the tool
      const result = await tool.execute(input, executionContext);

      const finishedAt = Date.now();

      // Record the tool call
      const record = context.recordToolCall({
        toolName: tool.name,
        input,
        ...(result.success && { output: result.output }),
        success: result.success,
        ...(!result.success && {
          error:
            result.error instanceof Error
              ? result.error.message
              : String(result.error),
        }),
        startedAt,
        finishedAt,
        metadata: {},
      });

      // Trigger after-tool hook
      await this.triggerHook(HookEvents.AfterTool, {
        context,
        tool,
        result,
        record,
      });

      return result;
    } catch (error) {
      const failure = ToolResultFactory.failure(
        toolName,
        error instanceof Error ? error : new Error(String(error)),
        {
          startedAt,
          finishedAt: Date.now(),
        },
      );

      const record = context.recordToolCall({
        toolName: tool.name,
        input,
        success: false,
        error:
          failure.error instanceof Error
            ? failure.error.message
            : String(failure.error),
        startedAt,
        finishedAt: failure.finishedAt,
        metadata: {},
      });

      // Trigger tool-error hook
      await this.triggerHook(HookEvents.ToolError, {
        context,
        tool,
        toolName: tool.name,
        error,
      });

      // Ensure after-tool observers see the recorded failure
      await this.triggerHook(HookEvents.AfterTool, {
        context,
        tool,
        result: failure,
        record,
      });

      return failure;
    }
  }

  private registerTools(
    entries: Array<Tool<unknown, unknown> | ToolProvider>,
  ): void {
    const { tools, providers } = normalizeToolEntries(entries);

    for (const tool of tools) {
      this.addTool(tool);
    }

    for (const provider of providers) {
      this.toolProviders.add(provider);
    }
  }

  private async activateToolProviders(): Promise<void> {
    const activationPromises = Array.from(this.toolProviders)
      .filter((provider) => !this.providerToolRegistry.has(provider))
      .map(async (provider) => {
        try {
          const baseAgent = this as unknown as BaseAgent<unknown, unknown>;
          const providedTools = (await provider.setup(baseAgent)) ?? [];
          const normalizedTools = providedTools.map((tool) =>
            coerceToolDefinition(tool),
          );

          this.providerToolRegistry.set(provider, normalizedTools);

          for (const tool of normalizedTools) {
            if (this.tools.has(tool.name)) {
              console.warn(
                `[${this.name}] Tool "${tool.name}" from provider overwrites existing tool.`,
              );
            }
            this.tools.set(tool.name, tool);
          }
        } catch (error) {
          console.warn(
            `[${this.name}] Failed to activate tool provider:`,
            error,
          );
        }
      });

    await Promise.allSettled(activationPromises);
  }

  private async deactivateToolProviders(): Promise<void> {
    const teardownEntries = Array.from(this.providerToolRegistry.entries());
    this.providerToolRegistry.clear();

    const teardownPromises = teardownEntries.map(async ([provider, tools]) => {
      for (const tool of tools) {
        this.tools.delete(tool.name);

        const baseTool = this.baseTools.get(tool.name);
        if (baseTool) {
          this.tools.set(tool.name, baseTool);
        }
      }

      try {
        await provider.teardown();
      } catch (error) {
        console.warn(
          `[${this.name}] Error while tearing down tool provider:`,
          error,
        );
      }
    });

    await Promise.allSettled(teardownPromises);
  }

  /**
   * Generate a Mermaid flowchart diagram visualizing the agent's structure and flow.
   * Shows tools, hooks, schemas, providers, and nested agents.
   *
   * @param options - Visualization options
   * @returns Mermaid markdown string, or file path if outputPath was provided
   *
   * @example
   * ```typescript
   * // Generate diagram string
   * const diagram = await agent.visualizeFlow();
   * console.log(diagram);
   *
   * // Save to file
   * const path = await agent.visualizeFlow({ outputPath: "agent_flow.md" });
   * console.log(`Saved to ${path}`);
   *
   * // Include MCP tools details
   * const diagram = await agent.visualizeFlow({ includeMcpTools: true });
   * ```
   */
  public async visualizeFlow(options?: VisualizationOptions): Promise<string> {
    return generateAgentFlowDiagram(this, options);
  }
}
