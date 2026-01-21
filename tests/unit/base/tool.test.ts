import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  ToolResultFactory,
  ToolResultFailureSchema,
  ToolResultSchema,
  ToolResultSuccessSchema,
  coerceToolDefinition,
  createToolCallRecord,
  validateToolInput,
} from "@/base/tool";

describe("Tool helpers", () => {
  it("validates tool input", () => {
    const schema = z.object({ query: z.string().min(1) });
    const valid = validateToolInput(schema, { query: "hello" });
    const invalid = validateToolInput(schema, { query: "" });

    expect(valid.ok).toBe(true);
    expect(invalid.ok).toBe(false);
  });

  it("constructs tool results", () => {
    const success = ToolResultFactory.success("search", { value: 1 });
    const failure = ToolResultFactory.failure("search", "boom");

    expect(success.success).toBe(true);
    expect(failure.success).toBe(false);
    expect(failure.error).toBe("boom");
    expect(success.metadata).toEqual({});
    expect(failure.metadata).toEqual({});
  });

  it("constructs tool results with usage for agent-as-tool", () => {
    const usage = {
      requests: 2,
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      cost: { generation: 0.01, platform: 0.001, total: 0.011 },
    };

    const success = ToolResultFactory.success("nested_agent", { answer: "42" }, { usage });
    const failure = ToolResultFactory.failure("nested_agent", new Error("Agent failed"), { usage });

    expect(success.success).toBe(true);
    expect(success.usage).toEqual(usage);

    expect(failure.success).toBe(false);
    expect(failure.usage).toEqual(usage);
  });

  it("does not include usage when not provided", () => {
    const success = ToolResultFactory.success("regular_tool", { data: "test" });
    const failure = ToolResultFactory.failure("regular_tool", "error");

    expect(success.usage).toBeUndefined();
    expect(failure.usage).toBeUndefined();
  });

  it("validates tool results against schemas", () => {
    const success = ToolResultFactory.success("search", { value: 1 });
    const failure = ToolResultFactory.failure("search", new Error("nope"), {
      metadata: { retry: true },
    });

    const parsedSuccess = ToolResultSuccessSchema.parse(success);
    const parsedFailure = ToolResultFailureSchema.parse(failure);

    expect(parsedSuccess.output).toEqual({ value: 1 });
    expect(parsedFailure.error).toBeInstanceOf(Error);
    expect(parsedFailure.metadata).toEqual({ retry: true });
    expect(() =>
      ToolResultSchema.parse({ success: true, toolName: "x" }),
    ).toThrow();
  });

  it("coerces tool definitions and records calls", () => {
    const def = coerceToolDefinition({
      name: "search",
      schema: z.object({ query: z.string() }),
      execute: async () => ToolResultFactory.success("search", { value: 1 }),
    });

    expect(def.metadata).toEqual({});

    const record = createToolCallRecord({
      toolName: "search",
      input: { query: "foo" },
    });
    expect(record.toolName).toBe("search");
    expect(record.id).toBeDefined();
  });
});
