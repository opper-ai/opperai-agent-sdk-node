import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  BaseAgent,
  type BaseAgentConfig,
  DEFAULT_MODEL,
  type OpperClientConfig,
} from "@/base/agent";
import { AgentContext } from "@/base/context";
import { HookEvents } from "@/base/hooks";
import {
  ToolResultFactory,
  type Tool,
  type ToolExecutionContext,
} from "@/base/tool";

// Test agent implementation
class TestAgent extends BaseAgent<string, string> {
  protected override async runLoop(
    input: string,
    context: AgentContext,
  ): Promise<string> {
    void context;
    return `Processed: ${input}`;
  }

  public getOpperConfigForTesting(): OpperClientConfig {
    return this.opperConfig;
  }
}

// Test agent with custom lifecycle
class CustomLifecycleAgent extends BaseAgent<string, string> {
  public initializeCalled = false;
  public teardownCalled = false;
  public contextFromInit?: AgentContext;

  protected override async initializeContext(
    input: string,
    parentSpanId?: string,
  ): Promise<AgentContext> {
    this.initializeCalled = true;
    const context = await super.initializeContext(input, parentSpanId);
    this.contextFromInit = context;
    return context;
  }

  protected override async teardownContext(
    context: AgentContext,
  ): Promise<void> {
    this.teardownCalled = true;
    await super.teardownContext(context);
  }

  protected override async runLoop(
    input: string,
    context: AgentContext,
  ): Promise<string> {
    void context;
    return `Custom: ${input}`;
  }
}

describe("BaseAgent", () => {
  describe("Configuration", () => {
    it("initializes with minimal config", () => {
      const agent = new TestAgent({ name: "test-agent" });

      expect(agent.name).toBe("test-agent");
      expect(agent.maxIterations).toBe(25);
      expect(agent.model).toBe(DEFAULT_MODEL);
      expect(agent.enableMemory).toBe(false);
      expect(agent.getTools()).toEqual([]);
    });

    it("initializes with full config", () => {
      const inputSchema = z.string();
      const outputSchema = z.string();

      const config: BaseAgentConfig<string, string> = {
        name: "full-agent",
        description: "A fully configured agent",
        instructions: "Be helpful",
        maxIterations: 50,
        model: "claude-3",
        inputSchema,
        outputSchema,
        enableMemory: true,
        metadata: { version: "1.0" },
      };

      const agent = new TestAgent(config);

      expect(agent.name).toBe("full-agent");
      expect(agent.description).toBe("A fully configured agent");
      expect(agent.instructions).toBe("Be helpful");
      expect(agent.maxIterations).toBe(50);
      expect(agent.model).toBe("claude-3");
      expect(agent.inputSchema).toBe(inputSchema);
      expect(agent.outputSchema).toBe(outputSchema);
      expect(agent.enableMemory).toBe(true);
      expect(agent.metadata).toEqual({ version: "1.0" });
    });

    it("initializes with tools", () => {
      const tool: Tool<unknown, unknown> = {
        name: "search",
        description: "Search tool",
        schema: z.object({ query: z.string() }),
        execute: async () =>
          ToolResultFactory.success("search", { result: "found" }),
      };

      const agent = new TestAgent({
        name: "agent-with-tools",
        tools: [tool],
      });

      expect(agent.getTools()).toHaveLength(1);
      expect(agent.getTool("search")).toBe(tool);
    });

    it("uses environment variable for Opper API key", () => {
      const originalEnv = process.env["OPPER_API_KEY"];
      process.env["OPPER_API_KEY"] = "test-key-from-env";

      const agent = new TestAgent({ name: "env-test" });

      // Access protected property via test accessor
      expect(agent.getOpperConfigForTesting().apiKey).toBe("test-key-from-env");

      process.env["OPPER_API_KEY"] = originalEnv;
    });

    it("allows explicit Opper config to override environment", () => {
      const originalEnv = process.env["OPPER_API_KEY"];
      process.env["OPPER_API_KEY"] = "env-key";

      const agent = new TestAgent({
        name: "explicit-config",
        opperConfig: { apiKey: "explicit-key", baseUrl: undefined },
      });

      expect(agent.getOpperConfigForTesting().apiKey).toBe("explicit-key");

      process.env["OPPER_API_KEY"] = originalEnv;
    });
  });

  describe("Lifecycle", () => {
    it("calls initializeContext before runLoop", async () => {
      const agent = new CustomLifecycleAgent({ name: "lifecycle-test" });

      await agent.process("test input");

      expect(agent.initializeCalled).toBe(true);
      expect(agent.contextFromInit).toBeDefined();
      expect(agent.contextFromInit?.agentName).toBe("lifecycle-test");
      expect(agent.contextFromInit?.goal).toBe("test input");
    });

    it("calls teardownContext after runLoop", async () => {
      const agent = new CustomLifecycleAgent({ name: "teardown-test" });

      await agent.process("test input");

      expect(agent.teardownCalled).toBe(true);
    });

    it("calls teardownContext even on error", async () => {
      class ErrorAgent extends CustomLifecycleAgent {
        protected override async runLoop(): Promise<string> {
          throw new Error("Loop error");
        }
      }

      const agent = new ErrorAgent({ name: "error-test" });

      await expect(agent.process("test")).rejects.toThrow("Loop error");
      expect(agent.teardownCalled).toBe(true);
    });

    it("passes parentSpanId to context", async () => {
      const agent = new CustomLifecycleAgent({ name: "span-test" });

      await agent.process("test", "parent-span-123");

      expect(agent.contextFromInit?.parentSpanId).toBe("parent-span-123");
    });
  });

  describe("process() orchestration", () => {
    it("validates input with schema", async () => {
      const agent = new TestAgent({
        name: "validation-test",
        inputSchema: z.string().min(5),
      });

      await expect(agent.process("hi")).rejects.toThrow();
      await expect(agent.process("hello world")).resolves.toBe(
        "Processed: hello world",
      );
    });

    it("validates output with schema", async () => {
      class OutputValidationAgent extends BaseAgent<string, number> {
        protected override async runLoop(): Promise<number> {
          return 42;
        }
      }

      const agent = new OutputValidationAgent({
        name: "output-test",
        outputSchema: z.number().min(100),
      });

      await expect(agent.process("test")).rejects.toThrow();
    });

    it("returns validated output on success", async () => {
      const agent = new TestAgent({ name: "success-test" });

      const result = await agent.process("input");

      expect(result).toBe("Processed: input");
    });

    it("propagates errors from runLoop", async () => {
      class ErrorAgent extends BaseAgent<string, string> {
        protected override async runLoop(): Promise<string> {
          throw new Error("Custom error");
        }
      }

      const agent = new ErrorAgent({ name: "error-agent" });

      await expect(agent.process("test")).rejects.toThrow("Custom error");
    });
  });

  describe("Hook system", () => {
    it("triggers agent:start hook", async () => {
      const agent = new TestAgent({ name: "hook-test" });
      const startHook = vi.fn();

      agent.registerHook(HookEvents.AgentStart, startHook);

      await agent.process("test");

      expect(startHook).toHaveBeenCalledOnce();
      expect(startHook).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({ agentName: "hook-test" }),
        }),
      );
    });

    it("triggers agent:end hook on success", async () => {
      const agent = new TestAgent({ name: "hook-test" });
      const endHook = vi.fn();

      agent.registerHook(HookEvents.AgentEnd, endHook);

      await agent.process("test");

      expect(endHook).toHaveBeenCalledOnce();
      expect(endHook).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.any(Object),
          result: "Processed: test",
        }),
      );
    });

    it("triggers agent:end hook on error", async () => {
      class ErrorAgent extends BaseAgent<string, string> {
        protected override async runLoop(): Promise<string> {
          throw new Error("Test error");
        }
      }

      const agent = new ErrorAgent({ name: "error-hook" });
      const endHook = vi.fn();

      agent.registerHook(HookEvents.AgentEnd, endHook);

      await expect(agent.process("test")).rejects.toThrow("Test error");

      expect(endHook).toHaveBeenCalledOnce();
      expect(endHook).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.any(Object),
          error: expect.any(Error),
        }),
      );
    });

    it("allows hook unregistration", async () => {
      const agent = new TestAgent({ name: "unreg-test" });
      const hook = vi.fn();

      const unregister = agent.registerHook(HookEvents.AgentStart, hook);

      await agent.process("test1");
      expect(hook).toHaveBeenCalledOnce();

      unregister();

      await agent.process("test2");
      expect(hook).toHaveBeenCalledOnce(); // Still only once
    });

    it("continues execution if hook fails", async () => {
      const agent = new TestAgent({ name: "hook-error" });

      agent.registerHook(HookEvents.AgentStart, async () => {
        throw new Error("Hook failure");
      });

      // Should not throw, should log warning instead
      const result = await agent.process("test");
      expect(result).toBe("Processed: test");
    });
  });

  describe("Tool management", () => {
    let agent: TestAgent;
    let testTool: Tool<{ query: string }, { result: string }>;

    beforeEach(() => {
      agent = new TestAgent({ name: "tool-mgmt" });
      testTool = {
        name: "test-tool",
        description: "A test tool",
        schema: z.object({ query: z.string() }),
        execute: async () =>
          ToolResultFactory.success("test-tool", { result: "success" }),
      };
    });

    it("adds tools", () => {
      agent.addTool(testTool);

      expect(agent.getTool("test-tool")).toBe(testTool);
      expect(agent.getTools()).toContain(testTool);
    });

    it("removes tools", () => {
      agent.addTool(testTool);
      const removed = agent.removeTool("test-tool");

      expect(removed).toBe(true);
      expect(agent.getTool("test-tool")).toBeUndefined();
      expect(agent.getTools()).not.toContain(testTool);
    });

    it("returns false when removing non-existent tool", () => {
      const removed = agent.removeTool("non-existent");

      expect(removed).toBe(false);
    });

    it("gets all tools", () => {
      const tool1 = { ...testTool, name: "tool1" };
      const tool2 = { ...testTool, name: "tool2" };

      agent.addTool(tool1);
      agent.addTool(tool2);

      const tools = agent.getTools();

      expect(tools).toHaveLength(2);
      expect(tools).toContain(tool1);
      expect(tools).toContain(tool2);
    });
  });

  describe("asTool()", () => {
    it("converts agent to a tool", () => {
      const agent = new TestAgent({
        name: "agent-as-tool",
        description: "Agent to convert",
      });

      const tool = agent.asTool();

      expect(tool.name).toBe("agent-as-tool");
      expect(tool.description).toBe("Agent to convert");
      expect(tool.metadata?.["isAgent"]).toBe(true);
    });

    it("allows custom tool name and description", () => {
      const agent = new TestAgent({ name: "original" });

      const tool = agent.asTool("custom-name", "Custom description");

      expect(tool.name).toBe("custom-name");
      expect(tool.description).toBe("Custom description");
    });

    it("executes agent when tool is called", async () => {
      const agent = new TestAgent({ name: "executable-agent" });
      const tool = agent.asTool();

      const mockContext = new AgentContext({
        agentName: "caller",
        sessionId: "session-123",
        parentSpanId: "span-456",
      });

      const executionContext: ToolExecutionContext = {
        agentContext: mockContext,
        metadata: {},
      };

      const result = await tool.execute("test input", executionContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toBe("Processed: test input");
      }
    });

    it("returns failure when agent throws", async () => {
      class FailingAgent extends BaseAgent<string, string> {
        protected override async runLoop(): Promise<string> {
          throw new Error("Agent failed");
        }
      }

      const agent = new FailingAgent({ name: "failing" });
      const tool = agent.asTool();

      const mockContext = new AgentContext({
        agentName: "caller",
        sessionId: "session-123",
        parentSpanId: null,
      });

      const executionContext: ToolExecutionContext = {
        agentContext: mockContext,
        metadata: {},
      };

      const result = await tool.execute("test", executionContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error);
      }
    });
  });

  describe("executeTool()", () => {
    it("executes registered tool", async () => {
      class ExecuteToolAgent extends TestAgent {
        public async testExecuteTool(
          toolName: string,
          input: unknown,
          context: AgentContext,
        ) {
          return this.executeTool(toolName, input, context);
        }
      }

      const agent = new ExecuteToolAgent({ name: "exec-test" });

      const tool: Tool<{ x: number }, { y: number }> = {
        name: "math-tool",
        schema: z.object({ x: z.number() }),
        execute: async (input) =>
          ToolResultFactory.success("math-tool", { y: input.x * 2 }),
      };

      agent.addTool(tool);

      const context = new AgentContext({ agentName: "exec-test" });
      const recordSpy = vi.spyOn(context, "recordToolCall");

      const result = await agent.testExecuteTool(
        "math-tool",
        { x: 5 },
        context,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toEqual({ y: 10 });
      }
      expect(recordSpy).toHaveBeenCalled();
    });

    it("returns failure for non-existent tool", async () => {
      class ExecuteToolAgent extends TestAgent {
        public async testExecuteTool(
          toolName: string,
          input: unknown,
          context: AgentContext,
        ) {
          return this.executeTool(toolName, input, context);
        }
      }

      const agent = new ExecuteToolAgent({ name: "fail-test" });

      const context = new AgentContext({ agentName: "fail-test" });
      const recordSpy = vi.spyOn(context, "recordToolCall");

      const result = await agent.testExecuteTool("non-existent", {}, context);

      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessage =
          result.error instanceof Error
            ? result.error.message
            : String(result.error);
        expect(errorMessage).toMatch(/not found/);
      }
      expect(recordSpy).toHaveBeenCalled();
    });

    it("triggers tool hooks", async () => {
      class ExecuteToolAgent extends TestAgent {
        public async testExecuteTool(
          toolName: string,
          input: unknown,
          context: AgentContext,
        ) {
          return this.executeTool(toolName, input, context);
        }
      }

      const agent = new ExecuteToolAgent({ name: "hook-tool" });

      const tool: Tool<unknown, unknown> = {
        name: "hooked-tool",
        schema: z.unknown(),
        execute: async () =>
          ToolResultFactory.success("hooked-tool", { result: "ok" }),
      };

      agent.addTool(tool);

      const beforeHook = vi.fn();
      const afterHook = vi.fn();

      agent.registerHook(HookEvents.BeforeTool, beforeHook);
      agent.registerHook(HookEvents.AfterTool, afterHook);

      const context = new AgentContext({ agentName: "hook-tool" });
      const recordSpy = vi.spyOn(context, "recordToolCall");

      await agent.testExecuteTool("hooked-tool", { test: true }, context);

      expect(beforeHook).toHaveBeenCalledOnce();
      expect(afterHook).toHaveBeenCalledOnce();
      expect(recordSpy).toHaveBeenCalled();
    });

    it("records tool call in context", async () => {
      class ExecuteToolAgent extends TestAgent {
        public async testExecuteTool(
          toolName: string,
          input: unknown,
          context: AgentContext,
        ) {
          return this.executeTool(toolName, input, context);
        }
      }

      const agent = new ExecuteToolAgent({ name: "record-test" });

      const tool: Tool<unknown, unknown> = {
        name: "recorded-tool",
        schema: z.unknown(),
        execute: async () =>
          ToolResultFactory.success("recorded-tool", { done: true }),
      };

      agent.addTool(tool);

      const context = new AgentContext({ agentName: "record-test" });
      const recordSpy = vi.spyOn(context, "recordToolCall");

      await agent.testExecuteTool("recorded-tool", { input: "data" }, context);

      expect(recordSpy).toHaveBeenCalledOnce();
      expect(recordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: "recorded-tool",
          input: { input: "data" },
        }),
      );
    });
  });

  describe("run()", () => {
    it("returns result and usage object", async () => {
      const agent = new TestAgent({ name: "usage-test" });

      const response = await agent.run("test input");

      expect(response).toHaveProperty("result");
      expect(response).toHaveProperty("usage");
      expect(response.result).toBe("Processed: test input");
    });

    it("returns usage with expected structure", async () => {
      const agent = new TestAgent({ name: "usage-structure" });

      const { usage } = await agent.run("test");

      expect(usage).toHaveProperty("requests");
      expect(usage).toHaveProperty("inputTokens");
      expect(usage).toHaveProperty("outputTokens");
      expect(usage).toHaveProperty("totalTokens");
      expect(usage).toHaveProperty("cost");
      expect(usage.cost).toHaveProperty("generation");
      expect(usage.cost).toHaveProperty("platform");
      expect(usage.cost).toHaveProperty("total");
    });
  });
});
