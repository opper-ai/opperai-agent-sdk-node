import { describe, expect, it } from "vitest";

import {
  AgentContext,
  ExecutionCycleSchema,
  UsageSchema,
  createEmptyUsage,
  addUsage,
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

  it("tracks usage with source breakdown", () => {
    const context = new AgentContext({ agentName: "Coordinator" });

    // Add usage from first nested agent
    context.updateUsageWithSource("math_agent", {
      requests: 2,
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      cost: { generation: 0.01, platform: 0.002, total: 0.012 },
    });

    // Add usage from second nested agent
    context.updateUsageWithSource("research_agent", {
      requests: 1,
      inputTokens: 200,
      outputTokens: 100,
      totalTokens: 300,
      cost: { generation: 0.02, platform: 0.004, total: 0.024 },
    });

    // Verify totals are aggregated
    expect(context.usage.requests).toBe(3);
    expect(context.usage.totalTokens).toBe(450);
    expect(context.usage.cost.total).toBeCloseTo(0.036);

    // Verify breakdown is present
    expect(context.usage.breakdown).toBeDefined();
    expect(context.usage.breakdown?.["math_agent"]).toBeDefined();
    expect(context.usage.breakdown?.["research_agent"]).toBeDefined();

    // Verify breakdown values
    expect(context.usage.breakdown?.["math_agent"]?.totalTokens).toBe(150);
    expect(context.usage.breakdown?.["research_agent"]?.totalTokens).toBe(300);
  });

  it("accumulates usage from same source in breakdown", () => {
    const context = new AgentContext({ agentName: "Coordinator" });

    // First call to math_agent
    context.updateUsageWithSource("math_agent", {
      requests: 1,
      inputTokens: 50,
      outputTokens: 25,
      totalTokens: 75,
      cost: { generation: 0.01, platform: 0.001, total: 0.011 },
    });

    // Second call to math_agent
    context.updateUsageWithSource("math_agent", {
      requests: 1,
      inputTokens: 50,
      outputTokens: 25,
      totalTokens: 75,
      cost: { generation: 0.01, platform: 0.001, total: 0.011 },
    });

    // Verify breakdown accumulates
    expect(context.usage.breakdown?.["math_agent"]?.requests).toBe(2);
    expect(context.usage.breakdown?.["math_agent"]?.totalTokens).toBe(150);
  });

  it("preserves breakdown in snapshot", () => {
    const context = new AgentContext({ agentName: "Test" });

    context.updateUsageWithSource("nested_agent", {
      requests: 1,
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      cost: { generation: 0.01, platform: 0.001, total: 0.011 },
    });

    const snapshot = context.snapshot();

    // Verify breakdown is in snapshot
    expect(snapshot.usage.breakdown).toBeDefined();
    expect(snapshot.usage.breakdown?.["nested_agent"]?.totalTokens).toBe(150);

    // Verify it's a deep copy (modifying original doesn't affect snapshot)
    context.updateUsageWithSource("nested_agent", {
      requests: 1,
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      cost: { generation: 0.01, platform: 0.001, total: 0.011 },
    });

    expect(snapshot.usage.breakdown?.["nested_agent"]?.totalTokens).toBe(150);
    expect(context.usage.breakdown?.["nested_agent"]?.totalTokens).toBe(300);
  });

  it("cleans up breakdown when only parent agent present", () => {
    const context = new AgentContext({ agentName: "ParentAgent" });

    // Add usage from parent agent only
    context.updateUsageWithSource("ParentAgent", {
      requests: 2,
      inputTokens: 500,
      outputTokens: 200,
      totalTokens: 700,
      cost: { generation: 0.05, platform: 0.005, total: 0.055 },
    });

    // Breakdown should exist before cleanup
    expect(context.usage.breakdown).toBeDefined();
    expect(context.usage.breakdown?.["ParentAgent"]).toBeDefined();

    // Clean up - should remove breakdown since only parent
    context.cleanupBreakdownIfOnlyParent("ParentAgent");

    // Breakdown should be removed
    expect(context.usage.breakdown).toBeUndefined();

    // Totals should still be intact
    expect(context.usage.totalTokens).toBe(700);
  });

  it("keeps breakdown when nested agents are present", () => {
    const context = new AgentContext({ agentName: "ParentAgent" });

    // Add usage from parent agent
    context.updateUsageWithSource("ParentAgent", {
      requests: 1,
      inputTokens: 300,
      outputTokens: 100,
      totalTokens: 400,
      cost: { generation: 0.03, platform: 0.003, total: 0.033 },
    });

    // Add usage from nested agent
    context.updateUsageWithSource("nested_agent", {
      requests: 1,
      inputTokens: 200,
      outputTokens: 100,
      totalTokens: 300,
      cost: { generation: 0.02, platform: 0.002, total: 0.022 },
    });

    // Clean up - should NOT remove breakdown since nested agent exists
    context.cleanupBreakdownIfOnlyParent("ParentAgent");

    // Breakdown should still exist with both entries
    expect(context.usage.breakdown).toBeDefined();
    expect(context.usage.breakdown?.["ParentAgent"]).toBeDefined();
    expect(context.usage.breakdown?.["nested_agent"]).toBeDefined();
  });
});

describe("Usage helper functions", () => {
  it("createEmptyUsage returns zeroed usage object", () => {
    const empty = createEmptyUsage();

    expect(empty.requests).toBe(0);
    expect(empty.inputTokens).toBe(0);
    expect(empty.outputTokens).toBe(0);
    expect(empty.totalTokens).toBe(0);
    expect(empty.cost.generation).toBe(0);
    expect(empty.cost.platform).toBe(0);
    expect(empty.cost.total).toBe(0);
  });

  it("addUsage correctly adds two usage objects", () => {
    const a = {
      requests: 1,
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      cost: { generation: 0.01, platform: 0.001, total: 0.011 },
    };

    const b = {
      requests: 2,
      inputTokens: 200,
      outputTokens: 100,
      totalTokens: 300,
      cost: { generation: 0.02, platform: 0.002, total: 0.022 },
    };

    const result = addUsage(a, b);

    expect(result.requests).toBe(3);
    expect(result.inputTokens).toBe(300);
    expect(result.outputTokens).toBe(150);
    expect(result.totalTokens).toBe(450);
    expect(result.cost.generation).toBeCloseTo(0.03);
    expect(result.cost.platform).toBeCloseTo(0.003);
    expect(result.cost.total).toBeCloseTo(0.033);
  });
});
