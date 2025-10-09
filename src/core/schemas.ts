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
});

export type AgentDecision = z.infer<typeof AgentDecisionSchema>;

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
