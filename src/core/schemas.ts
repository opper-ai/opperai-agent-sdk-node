import { z } from "zod";

/**
 * Schema for agent's internal thought/reasoning
 */
export const ThoughtSchema = z.object({
  /**
   * The reasoning or internal monologue of the agent
   */
  reasoning: z.string(),

  /**
   * Planned next action(s)
   */
  plan: z.string().optional(),

  /**
   * Confidence level (0-1)
   */
  confidence: z.number().min(0).max(1).optional(),

  /**
   * Additional metadata
   */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type Thought = z.infer<typeof ThoughtSchema>;

/**
 * Schema for a tool call from the LLM
 */
export const ToolCallSchema = z.object({
  /**
   * Unique identifier for this tool call
   */
  id: z.string(),

  /**
   * Name of the tool to invoke
   */
  toolName: z.string(),

  /**
   * Arguments to pass to the tool
   */
  arguments: z.unknown(),
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

/**
 * Schema for memory updates (write operations)
 */
export const MemoryUpdateSchema = z.object({
  /**
   * Value to store for this key
   */
  value: z.unknown(),

  /**
   * Optional description of the memory entry
   */
  description: z.string().optional(),

  /**
   * Optional metadata for the memory entry
   */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type MemoryUpdate = z.infer<typeof MemoryUpdateSchema>;

/**
 * Schema for agent's decision output from the "think" step
 */
export const AgentDecisionSchema = z.object({
  /**
   * Agent's internal reasoning
   */
  reasoning: z.string(),

  /**
   * Tool calls to execute (if any)
   * Empty array signals task completion
   */
  toolCalls: z.array(ToolCallSchema).default([]),

  /**
   * Memory keys to read during this iteration
   */
  memoryReads: z.array(z.string()).default([]),

  /**
   * Memory entries to write/update (key -> payload)
   */
  memoryUpdates: z.record(MemoryUpdateSchema).default({}),

  /**
   * Whether the task is complete and finalResult is available
   * (single LLM call pattern)
   */
  isComplete: z.boolean().default(false),

  /**
   * The final result when isComplete=true
   * Should match outputSchema if specified
   */
  finalResult: z.unknown().optional(),
});

export type AgentDecision = z.infer<typeof AgentDecisionSchema>;

/**
 * Create an AgentDecision schema with typed finalResult field.
 *
 * When outputSchema is provided, the finalResult field will be typed
 * to that schema, allowing Opper to enforce the correct structure.
 * When finalResult is undefined/null, it passes through without validation.
 *
 * @param outputSchema - Optional Zod schema for the final result
 * @returns AgentDecision schema (original or dynamically created variant)
 */
export function createAgentDecisionWithOutputSchema<T>(
  outputSchema?: z.ZodType<T>,
): z.ZodObject<z.ZodRawShape> {
  if (!outputSchema) {
    return AgentDecisionSchema;
  }

  // Use the actual outputSchema wrapped in optional() so that:
  // 1. JSON Schema generation includes the proper structure for the LLM
  // 2. Validation works correctly when finalResult is provided
  // 3. undefined/null values are accepted when task isn't complete
  const finalResultSchema = outputSchema.optional();

  const dynamicSchema = z.object({
    reasoning: z.string(),
    toolCalls: z.array(ToolCallSchema).default([]),
    memoryReads: z.array(z.string()).default([]),
    memoryUpdates: z.record(MemoryUpdateSchema).default({}),
    isComplete: z.boolean().default(false),
    finalResult: finalResultSchema,
  });

  return dynamicSchema;
}

/**
 * Schema for tool execution result summary
 */
export const ToolExecutionSummarySchema = z.object({
  /**
   * Tool name
   */
  toolName: z.string(),

  /**
   * Whether execution succeeded
   */
  success: z.boolean(),

  /**
   * Output if successful
   */
  output: z.unknown().optional(),

  /**
   * Error message if failed
   */
  error: z.string().optional(),
});

export type ToolExecutionSummary = z.infer<typeof ToolExecutionSummarySchema>;
