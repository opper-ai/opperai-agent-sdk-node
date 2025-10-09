import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AgentContext } from "@/base/context";
import type { Tool, ToolExecutionContext, ToolResult } from "@/base/tool";
import { ToolResultFactory } from "@/base/tool";
import { ToolRunner } from "@/utils/tool-runner";

describe("ToolRunner", () => {
  describe("execute", () => {
    it("executes a tool successfully", async () => {
      const tool: Tool<{ value: number }, number> = {
        name: "double",
        description: "Double a number",
        execute: async (input) =>
          ToolResultFactory.success("double", input.value * 2),
      };

      const context = new AgentContext({ agentName: "test", goal: "test" });
      const result = await ToolRunner.execute(tool, { value: 5 }, context);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toBe(10);
      }
    });

    it("validates input with schema before execution", async () => {
      const schema = z.object({
        value: z.number().positive(),
      });

      const tool: Tool<{ value: number }, number> = {
        name: "validate",
        description: "Validate input",
        schema,
        execute: async (input) =>
          ToolResultFactory.success("validate", input.value),
      };

      const context = new AgentContext({ agentName: "test", goal: "test" });

      // Valid input
      const validResult = await ToolRunner.execute(
        tool,
        { value: 10 },
        context,
      );
      expect(validResult.success).toBe(true);

      // Invalid input
      const invalidResult = await ToolRunner.execute(
        tool,
        { value: -5 },
        context,
      );
      expect(invalidResult.success).toBe(false);
      if (!invalidResult.success) {
        const error = invalidResult.error as Error;
        expect(error.message).toContain("Invalid input");
      }
    });

    it("handles tool execution errors", async () => {
      const tool: Tool<{ value: string }, string> = {
        name: "failing",
        description: "Failing tool",
        execute: async () => {
          throw new Error("Tool error");
        },
      };

      const context = new AgentContext({ agentName: "test", goal: "test" });
      const result = await ToolRunner.execute(tool, { value: "test" }, context);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as Error;
        expect(error.message).toBe("Tool error");
      }
    });

    it("respects abort signal", async () => {
      const tool: Tool<{ value: string }, string> = {
        name: "abortable",
        description: "Abortable tool",
        execute: async (input) =>
          ToolResultFactory.success("abortable", input.value),
      };

      const context = new AgentContext({ agentName: "test", goal: "test" });
      const abortController = new AbortController();
      abortController.abort();

      const result = await ToolRunner.execute(
        tool,
        { value: "test" },
        context,
        {
          signal: abortController.signal,
        },
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as Error;
        expect(error.message).toContain("aborted");
      }
    });

    it("passes metadata to execution context", async () => {
      let receivedMetadata: Record<string, unknown> | undefined;

      const tool: Tool<{ value: string }, string> = {
        name: "metadata-tool",
        description: "Tool that checks metadata",
        execute: async (input, context) => {
          receivedMetadata = context.metadata;
          return ToolResultFactory.success("metadata-tool", input.value);
        },
      };

      const context = new AgentContext({ agentName: "test", goal: "test" });
      await ToolRunner.execute(tool, { value: "test" }, context, {
        metadata: { custom: "data" },
      });

      expect(receivedMetadata?.["custom"]).toBe("data");
    });

    it("enforces tool-level timeout", async () => {
      const tool: Tool<Record<string, never>, string> = {
        name: "slow",
        description: "Slow tool",
        timeoutMs: 50,
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return ToolResultFactory.success("slow", "done");
        },
      };

      const context = new AgentContext({ agentName: "test", goal: "test" });
      const result = await ToolRunner.execute(tool, {}, context);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as Error;
        expect(error.message).toContain("timed out");
      }
    });

    it("overrides tool timeout with option timeout", async () => {
      const tool: Tool<Record<string, never>, string> = {
        name: "slow",
        description: "Slow tool",
        timeoutMs: 1000, // Tool default
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return ToolResultFactory.success("slow", "done");
        },
      };

      const context = new AgentContext({ agentName: "test", goal: "test" });
      const result = await ToolRunner.execute(tool, {}, context, {
        timeoutMs: 50, // Option override
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as Error;
        expect(error.message).toContain("timed out");
      }
    });

    it("completes within timeout", async () => {
      const tool: Tool<Record<string, never>, string> = {
        name: "fast",
        description: "Fast tool",
        timeoutMs: 100,
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return ToolResultFactory.success("fast", "done");
        },
      };

      const context = new AgentContext({ agentName: "test", goal: "test" });
      const result = await ToolRunner.execute(tool, {}, context);

      expect(result.success).toBe(true);
    });
  });

  describe("executeParallel", () => {
    it("executes multiple tools in parallel", async () => {
      const tool1: Tool<{ value: number }, number> = {
        name: "tool1",
        execute: async (input) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return ToolResultFactory.success("tool1", input.value * 2);
        },
      };

      const tool2: Tool<{ value: number }, number> = {
        name: "tool2",
        execute: async (input) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return ToolResultFactory.success("tool2", input.value + 10);
        },
      };

      const context = new AgentContext({ agentName: "test", goal: "test" });

      const startTime = Date.now();
      const results = await ToolRunner.executeParallel([
        [tool1, { value: 5 }, context],
        [tool2, { value: 5 }, context],
      ]);
      const duration = Date.now() - startTime;

      // Should complete in roughly the time of the slowest tool (parallel execution)
      expect(duration).toBeLessThan(50);

      expect(results).toHaveLength(2);
      expect(results[0]?.success).toBe(true);
      expect(results[1]?.success).toBe(true);

      if (results[0]?.success) {
        expect(results[0].output).toBe(10);
      }
      if (results[1]?.success) {
        expect(results[1].output).toBe(15);
      }
    });

    it("returns results in same order as input", async () => {
      const tools: Array<Tool<unknown, number>> = [1, 2, 3].map((n) => ({
        name: `tool${n}`,
        async execute(input: unknown, context: ToolExecutionContext) {
          void input;
          void context;
          return ToolResultFactory.success(`tool${n}`, n);
        },
      }));

      const context = new AgentContext({ agentName: "test", goal: "test" });

      const tasks: Array<[Tool<unknown, number>, unknown, AgentContext]> =
        tools.map((tool) => [tool, {}, context]);

      const results = await ToolRunner.executeParallel(tasks);

      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.output).toBe(index + 1);
        }
      });
    });

    it("continues execution even if some tools fail", async () => {
      const successTool: Tool<Record<string, never>, string> = {
        name: "success",
        execute: async () => ToolResultFactory.success("success", "ok"),
      };

      const failTool: Tool<Record<string, never>, string> = {
        name: "fail",
        execute: async () => {
          throw new Error("Tool failed");
        },
      };

      const context = new AgentContext({ agentName: "test", goal: "test" });

      const results = await ToolRunner.executeParallel([
        [successTool, {}, context],
        [failTool, {}, context],
        [successTool, {}, context],
      ]);

      expect(results).toHaveLength(3);
      expect(results[0]?.success).toBe(true);
      expect(results[1]?.success).toBe(false);
      expect(results[2]?.success).toBe(true);
    });
  });

  describe("executeSequential", () => {
    it("executes tools sequentially", async () => {
      const executionOrder: number[] = [];

      const tools: Array<Tool<unknown, number>> = [1, 2, 3].map((n) => ({
        name: `tool${n}`,
        async execute(input: unknown, context: ToolExecutionContext) {
          void input;
          void context;
          executionOrder.push(n);
          await new Promise((resolve) => setTimeout(resolve, 10));
          return ToolResultFactory.success(`tool${n}`, n);
        },
      }));

      const context = new AgentContext({ agentName: "test", goal: "test" });

      const tasks: Array<[Tool<unknown, number>, unknown, AgentContext]> =
        tools.map((tool) => [tool, {}, context]);

      const results = await ToolRunner.executeSequential(tasks);

      expect(results).toHaveLength(3);
      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it("stops on first failure", async () => {
      const executionCount = { count: 0 };

      const successTool: Tool<Record<string, never>, string> = {
        name: "success",
        execute: async () => {
          executionCount.count++;
          return ToolResultFactory.success("success", "ok");
        },
      };

      const failTool: Tool<Record<string, never>, string> = {
        name: "fail",
        execute: async () => {
          executionCount.count++;
          throw new Error("Tool failed");
        },
      };

      const context = new AgentContext({ agentName: "test", goal: "test" });

      const results = await ToolRunner.executeSequential([
        [successTool, {}, context],
        [failTool, {}, context],
        [successTool, {}, context], // Should not execute
      ]);

      expect(results).toHaveLength(2); // Only first two executed
      expect(results[0]?.success).toBe(true);
      expect(results[1]?.success).toBe(false);
      expect(executionCount.count).toBe(2); // Third tool not executed
    });

    it("returns all results if all succeed", async () => {
      const successTool: Tool<Record<string, never>, string> = {
        name: "success",
        execute: async () => ToolResultFactory.success("success", "ok"),
      };

      const context = new AgentContext({ agentName: "test", goal: "test" });

      const results = await ToolRunner.executeSequential([
        [successTool, {}, context],
        [successTool, {}, context],
        [successTool, {}, context],
      ]);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  describe("validate", () => {
    it("returns true for valid input", () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const tool: Tool<{ name: string; age: number }, string> = {
        name: "test",
        schema,
        execute: async () => ToolResultFactory.success("test", "ok"),
      };

      const result = ToolRunner.validate(tool, { name: "Alice", age: 30 });
      expect(result).toBe(true);
    });

    it("returns Error for invalid input", () => {
      const schema = z.object({
        value: z.number().positive(),
      });

      const tool: Tool<{ value: number }, number> = {
        name: "test",
        schema,
        execute: async () => ToolResultFactory.success("test", 0),
      };

      const result = ToolRunner.validate(tool, { value: -5 });
      expect(result).toBeInstanceOf(Error);
      if (result instanceof Error) {
        expect(result.message).toContain("Invalid input");
      }
    });

    it("returns true for tools without schema", () => {
      const tool: Tool<{ value: string }, string> = {
        name: "test",
        execute: async () => ToolResultFactory.success("test", "ok"),
      };

      const result = ToolRunner.validate(tool, { value: "anything" });
      expect(result).toBe(true);
    });
  });

  describe("isSuccess", () => {
    it("returns true for successful results", () => {
      const result: ToolResult<string> = ToolResultFactory.success(
        "test",
        "output",
      );
      expect(ToolRunner.isSuccess(result)).toBe(true);
    });

    it("returns false for failed results", () => {
      const result: ToolResult<string> = ToolResultFactory.failure(
        "test",
        new Error("failed"),
      );
      expect(ToolRunner.isSuccess(result)).toBe(false);
    });

    it("narrows type correctly", () => {
      const result: ToolResult<number> = ToolResultFactory.success("test", 42);

      if (ToolRunner.isSuccess(result)) {
        // Type should be narrowed to ToolSuccess<number>
        expect(result.output).toBe(42);
      } else {
        throw new Error("Should be success");
      }
    });
  });

  describe("isFailure", () => {
    it("returns true for failed results", () => {
      const result: ToolResult<string> = ToolResultFactory.failure(
        "test",
        new Error("failed"),
      );
      expect(ToolRunner.isFailure(result)).toBe(true);
    });

    it("returns false for successful results", () => {
      const result: ToolResult<string> = ToolResultFactory.success(
        "test",
        "output",
      );
      expect(ToolRunner.isFailure(result)).toBe(false);
    });

    it("narrows type correctly", () => {
      const result: ToolResult<number> = ToolResultFactory.failure(
        "test",
        new Error("fail"),
      );

      if (ToolRunner.isFailure(result)) {
        // Type should be narrowed to ToolFailure
        expect(result.error).toBeInstanceOf(Error);
      } else {
        throw new Error("Should be failure");
      }
    });
  });
});
