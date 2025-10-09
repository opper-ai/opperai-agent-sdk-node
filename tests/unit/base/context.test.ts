import { describe, expect, it } from "vitest";

import {
  AgentContext,
  ExecutionCycleSchema,
  UsageSchema,
} from "@/base/context";
import { ToolCallRecordSchema, ToolResultFactory } from "@/base/tool";

describe("AgentContext", () => {
  it("accumulates usage metrics", () => {
    const context = new AgentContext({ agentName: "Tester" });
    const usageDelta = UsageSchema.parse({
      requests: 1,
      inputTokens: 50,
      outputTokens: 25,
      totalTokens: 75,
    });

    context.updateUsage(usageDelta);
    context.updateUsage(usageDelta);

    expect(context.usage.requests).toBe(2);
    expect(context.usage.totalTokens).toBe(150);
    expect(context.getContextSize()).toBe(150);
  });

  it("records cycles and tool calls", () => {
    const context = new AgentContext({ agentName: "Recorder" });

    const toolCall = ToolCallRecordSchema.parse({
      toolName: "search",
      input: { query: "hello" },
      startedAt: 1,
    });

    context.recordToolCall(toolCall);

    const cycle = ExecutionCycleSchema.parse({
      iteration: 1,
      thought: { reasoning: "test" },
      toolCalls: [toolCall],
      results: [ToolResultFactory.success("search", { value: 42 })],
    });

    context.addCycle(cycle);

    expect(context.executionHistory).toHaveLength(1);
    expect(context.toolCalls).toHaveLength(1);
    const cycles = context.getLastNCycles(1);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]?.iteration).toBe(1);

    const summaries = context.getLastIterationsSummary(1);
    expect(summaries).toHaveLength(1);

    const [summary] = summaries;
    expect(summary?.iteration).toBe(1);
    expect(Array.isArray(summary?.toolCalls)).toBe(true);
  });

  it("captures metadata updates", () => {
    const context = new AgentContext({ agentName: "Meta" });
    context.setMetadata("foo", "bar");
    expect(context.metadata["foo"]).toBe("bar");

    const snapshot = context.snapshot();
    expect(snapshot.metadata["foo"]).toBe("bar");
    expect(snapshot.agentName).toBe("Meta");
  });
});
