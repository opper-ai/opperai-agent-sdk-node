import { randomUUID } from "node:crypto";
import { z } from "zod";

import { ToolCallRecordSchema, type ToolCallRecord } from "./tool";

/**
 * Base usage schema without breakdown (to avoid circular reference)
 */
export const BaseUsageSchema = z.object({
  requests: z.number().int().nonnegative().default(0),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  totalTokens: z.number().int().nonnegative().default(0),
  cost: z
    .object({
      generation: z.number().nonnegative().default(0),
      platform: z.number().nonnegative().default(0),
      total: z.number().nonnegative().default(0),
    })
    .default({ generation: 0, platform: 0, total: 0 }),
});

/**
 * Base usage type (without breakdown) - used for breakdown entries
 */
export type BaseUsage = z.infer<typeof BaseUsageSchema>;

/**
 * Full usage schema with optional breakdown for nested agent tracking
 */
export const UsageSchema = BaseUsageSchema.extend({
  /**
   * Optional breakdown of usage by source (agent name).
   * Only present when nested agents are used.
   */
  breakdown: z.record(z.string(), z.lazy(() => BaseUsageSchema)).optional(),
});

export type Usage = z.infer<typeof UsageSchema>;

/**
 * Create an empty usage object with all values set to 0
 */
export function createEmptyUsage(): Usage {
  return {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cost: {
      generation: 0,
      platform: 0,
      total: 0,
    },
  };
}

/**
 * Add two usage objects together, returning a new usage object
 */
export function addUsage(a: Usage, b: Usage): Usage {
  return {
    requests: a.requests + b.requests,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    cost: {
      generation: a.cost.generation + b.cost.generation,
      platform: a.cost.platform + b.cost.platform,
      total: a.cost.total + b.cost.total,
    },
  };
}

export const ExecutionCycleSchema = z.object({
  iteration: z.number().int().nonnegative(),
  thought: z.unknown().nullable().optional(),
  toolCalls: z.array(ToolCallRecordSchema).default([]),
  results: z.array(z.unknown()).default([]),
  timestamp: z.number().default(() => Date.now()),
});

export type ExecutionCycle = z.infer<typeof ExecutionCycleSchema>;

export interface AgentContextOptions {
  agentName: string;
  sessionId?: string;
  parentSpanId?: string | null;
  goal?: unknown;
  metadata?: Record<string, unknown>;
}

export interface AgentContextSnapshot {
  agentName: string;
  sessionId: string;
  parentSpanId: string | null;
  iteration: number;
  goal?: unknown;
  executionHistory: ExecutionCycle[];
  usage: Usage;
  toolCalls: ToolCallRecord[];
  metadata: Record<string, unknown>;
  startedAt: number;
  updatedAt: number;
}

export interface IterationSummary {
  iteration: number;
  thought: Record<string, unknown>;
  toolCalls: Array<{ toolName: string; success?: boolean }>;
  results: unknown[];
}

export class AgentContext {
  public readonly agentName: string;

  public readonly sessionId: string;

  public parentSpanId: string | null;

  public iteration = 0;

  public goal?: unknown;

  public readonly executionHistory: ExecutionCycle[] = [];

  public readonly toolCalls: ToolCallRecord[] = [];

  public usage: Usage;

  public metadata: Record<string, unknown>;

  public readonly startedAt: number;

  public updatedAt: number;

  constructor(options: AgentContextOptions) {
    const now = Date.now();
    this.agentName = options.agentName;
    this.sessionId = options.sessionId ?? randomUUID();
    this.parentSpanId = options.parentSpanId ?? null;
    this.goal = options.goal;
    this.metadata = { ...(options.metadata ?? {}) };
    this.startedAt = now;
    this.updatedAt = now;
    this.usage = UsageSchema.parse({});
  }

  public updateUsage(delta: Usage): void {
    const next = UsageSchema.parse(delta);
    this.usage = {
      requests: this.usage.requests + next.requests,
      inputTokens: this.usage.inputTokens + next.inputTokens,
      outputTokens: this.usage.outputTokens + next.outputTokens,
      totalTokens: this.usage.totalTokens + next.totalTokens,
      cost: {
        generation: this.usage.cost.generation + next.cost.generation,
        platform: this.usage.cost.platform + next.cost.platform,
        total: this.usage.cost.total + next.cost.total,
      },
      // Preserve existing breakdown
      ...(this.usage.breakdown && { breakdown: this.usage.breakdown }),
    };
    this.touch();
  }

  /**
   * Update usage with source tracking for nested agent aggregation.
   * This method updates the total usage AND tracks it by source in the breakdown.
   *
   * @param source - The source name (typically the agent/tool name)
   * @param delta - The usage to add
   */
  public updateUsageWithSource(source: string, delta: Usage): void {
    // Update totals
    this.updateUsage(delta);

    // Initialize breakdown if needed
    if (!this.usage.breakdown) {
      this.usage.breakdown = {};
    }

    // Update breakdown for this source
    const existing = this.usage.breakdown[source] ?? createEmptyUsage();
    this.usage.breakdown[source] = addUsage(existing, delta);
    // touch() not needed - already called by updateUsage()
  }

  /**
   * Clean up the usage breakdown if it only contains the parent agent.
   * This ensures breakdown is only present when there are nested agents.
   *
   * @param parentAgentName - The name of the parent agent to check for
   */
  public cleanupBreakdownIfOnlyParent(parentAgentName: string): void {
    if (!this.usage.breakdown) {
      return;
    }

    const sources = Object.keys(this.usage.breakdown);

    // If only the parent agent is in the breakdown, remove it
    if (sources.length === 1 && sources[0] === parentAgentName) {
      delete this.usage.breakdown;
    }
  }

  public addCycle(cycle: ExecutionCycle): ExecutionCycle {
    const parsed = ExecutionCycleSchema.parse(cycle);
    this.executionHistory.push(parsed);
    this.touch();
    return parsed;
  }

  public recordToolCall(call: Omit<ToolCallRecord, "id">): ToolCallRecord {
    const parsed = ToolCallRecordSchema.parse(call);
    this.toolCalls.push(parsed);
    this.touch();
    return parsed;
  }

  public getContextSize(): number {
    return this.usage.totalTokens;
  }

  public getLastNCycles(count = 3): ExecutionCycle[] {
    if (count <= 0) {
      return [];
    }
    return this.executionHistory.slice(-count);
  }

  public getLastIterationsSummary(count = 2): IterationSummary[] {
    return this.getLastNCycles(count).map((cycle) => {
      const thought: Record<string, unknown> =
        typeof cycle.thought === "object" && cycle.thought !== null
          ? { ...(cycle.thought as Record<string, unknown>) }
          : { text: cycle.thought };

      return {
        iteration: cycle.iteration,
        thought,
        toolCalls: cycle.toolCalls.map((call) => ({
          toolName: call.toolName,
          ...(call.success !== undefined && { success: call.success }),
        })),
        results: [...cycle.results],
      } satisfies IterationSummary;
    });
  }

  public setMetadata(key: string, value: unknown): void {
    this.metadata[key] = value;
    this.touch();
  }

  public clearHistory(): void {
    this.executionHistory.length = 0;
    this.toolCalls.length = 0;
    this.touch();
  }

  public snapshot(): AgentContextSnapshot {
    // Deep copy usage including breakdown if present
    const usageCopy: Usage = {
      ...this.usage,
      cost: { ...this.usage.cost },
      ...(this.usage.breakdown && {
        breakdown: Object.fromEntries(
          Object.entries(this.usage.breakdown).map(([key, value]) => [
            key,
            { ...value, cost: { ...value.cost } },
          ]),
        ),
      }),
    };

    return {
      agentName: this.agentName,
      sessionId: this.sessionId,
      parentSpanId: this.parentSpanId,
      iteration: this.iteration,
      goal: this.goal,
      executionHistory: [...this.executionHistory],
      usage: usageCopy,
      toolCalls: [...this.toolCalls],
      metadata: { ...this.metadata },
      startedAt: this.startedAt,
      updatedAt: this.updatedAt,
    };
  }

  private touch(): void {
    this.updatedAt = Date.now();
  }
}
