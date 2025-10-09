import { randomUUID } from "node:crypto";
import { z } from "zod";

import { ToolCallRecordSchema, type ToolCallRecord } from "./tool";

export const UsageSchema = z.object({
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

export type Usage = z.infer<typeof UsageSchema>;

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
    };
    this.touch();
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
    return {
      agentName: this.agentName,
      sessionId: this.sessionId,
      parentSpanId: this.parentSpanId,
      iteration: this.iteration,
      goal: this.goal,
      executionHistory: [...this.executionHistory],
      usage: { ...this.usage },
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
