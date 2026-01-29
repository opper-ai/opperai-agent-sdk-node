import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AgentContext } from "@/base/context";
import { HookEvents, HookManager } from "@/base/hooks";
import type { Tool } from "@/base/tool";
import { ToolResultFactory } from "@/base/tool";
import { ConsoleLogger, LogLevel, SilentLogger } from "@/utils/logger";

const createTool = (name: string): Tool<unknown, unknown> => ({
  name,
  schema: z.any(),
  metadata: {},
  execute: vi.fn(async () => ToolResultFactory.success(name, null)),
});

describe("HookManager", () => {
  it("registers and emits hooks", async () => {
    const manager = new HookManager();
    const context = new AgentContext({ agentName: "Hooks" });
    const handler = vi.fn();

    manager.on(HookEvents.AgentStart, handler);
    await manager.emit(HookEvents.AgentStart, { context });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(manager.listenerCount(HookEvents.AgentStart)).toBe(1);
  });

  it("supports once handlers", async () => {
    const manager = new HookManager();
    const context = new AgentContext({ agentName: "Hooks" });
    const handler = vi.fn();

    manager.once(HookEvents.AgentEnd, async ({ context: ctx }) => {
      handler(ctx.agentName);
    });

    await manager.emit(HookEvents.AgentEnd, { context, result: "ok" });
    await manager.emit(HookEvents.AgentEnd, { context, result: "ok" });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("Hooks");
  });

  it("emits tool lifecycle payloads", async () => {
    const manager = new HookManager();
    const context = new AgentContext({ agentName: "Hooks" });
    const tool = createTool("echo");
    const handler = vi.fn();

    manager.on(HookEvents.AfterTool, handler);

    await manager.emit(HookEvents.AfterTool, {
      context,
      tool,
      result: {
        success: true,
        toolName: tool.name,
        output: "done",
        metadata: {},
      },
      record: {
        id: "123",
        toolName: tool.name,
        input: "hello",
        success: true,
        startedAt: Date.now(),
        metadata: {},
      },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const firstCall = handler.mock.calls[0];
    expect(firstCall).toBeDefined();
    expect(firstCall?.[0].tool.name).toBe("echo");
  });

  describe("Logger integration", () => {
    it("accepts custom logger", () => {
      const customLogger = new SilentLogger();
      const manager = new HookManager(customLogger);

      expect(manager).toBeInstanceOf(HookManager);
    });

    it("uses default logger when none provided", () => {
      const manager = new HookManager();
      expect(manager).toBeInstanceOf(HookManager);
    });
  });

  describe("Error isolation (Promise.allSettled semantics)", () => {
    it("continues executing hooks even if one fails", async () => {
      const logger = new SilentLogger();
      const manager = new HookManager(logger);
      const context = new AgentContext({ agentName: "test" });

      const handler1 = vi.fn();
      const handler2 = vi.fn(() => {
        throw new Error("Handler 2 failed");
      });
      const handler3 = vi.fn();

      manager.on(HookEvents.AgentStart, handler1);
      manager.on(HookEvents.AgentStart, handler2);
      manager.on(HookEvents.AgentStart, handler3);

      await manager.emit(HookEvents.AgentStart, { context });

      // All handlers should have been called despite handler2 throwing
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });

    it("logs warnings for failed handlers", async () => {
      const logger = new ConsoleLogger(LogLevel.WARN);
      const warnSpy = vi.spyOn(logger, "warn");
      const manager = new HookManager(logger);
      const context = new AgentContext({ agentName: "test" });

      manager.on(HookEvents.AgentStart, () => {
        throw new Error("Handler failed");
      });

      await manager.emit(HookEvents.AgentStart, { context });

      expect(warnSpy).toHaveBeenCalledWith(
        'Hook handler failed for event "agent:start"',
        expect.objectContaining({
          event: "agent:start",
          handlerIndex: 0,
          error: "Handler failed",
        }),
      );

      warnSpy.mockRestore();
    });

    it("handles async handler failures", async () => {
      const logger = new SilentLogger();
      const manager = new HookManager(logger);
      const context = new AgentContext({ agentName: "test" });

      const handler1 = vi.fn();
      const handler2 = vi.fn(async () => {
        throw new Error("Async handler failed");
      });
      const handler3 = vi.fn();

      manager.on(HookEvents.AgentStart, handler1);
      manager.on(HookEvents.AgentStart, handler2);
      manager.on(HookEvents.AgentStart, handler3);

      await manager.emit(HookEvents.AgentStart, { context });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });

    it("handles non-Error throws", async () => {
      const logger = new ConsoleLogger(LogLevel.WARN);
      const warnSpy = vi.spyOn(logger, "warn");
      const manager = new HookManager(logger);
      const context = new AgentContext({ agentName: "test" });

      manager.on(HookEvents.AgentStart, () => {
        throw "String error";
      });

      await manager.emit(HookEvents.AgentStart, { context });

      expect(warnSpy).toHaveBeenCalledWith(
        'Hook handler failed for event "agent:start"',
        expect.objectContaining({
          error: "String error",
        }),
      );

      warnSpy.mockRestore();
    });

    it("does not throw when all handlers fail", async () => {
      const logger = new SilentLogger();
      const manager = new HookManager(logger);
      const context = new AgentContext({ agentName: "test" });

      manager.on(HookEvents.AgentStart, () => {
        throw new Error("Failed 1");
      });
      manager.on(HookEvents.AgentStart, () => {
        throw new Error("Failed 2");
      });

      // Should not throw
      await expect(
        manager.emit(HookEvents.AgentStart, { context }),
      ).resolves.toBeUndefined();
    });
  });

  describe("Ordering guarantees", () => {
    it("executes handlers in registration order", async () => {
      const manager = new HookManager(new SilentLogger());
      const context = new AgentContext({ agentName: "test" });
      const executionOrder: number[] = [];

      manager.on(HookEvents.AgentStart, async () => {
        executionOrder.push(1);
      });
      manager.on(HookEvents.AgentStart, async () => {
        executionOrder.push(2);
      });
      manager.on(HookEvents.AgentStart, async () => {
        executionOrder.push(3);
      });

      await manager.emit(HookEvents.AgentStart, { context });

      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it("maintains order even with mixed sync/async handlers", async () => {
      const manager = new HookManager(new SilentLogger());
      const context = new AgentContext({ agentName: "test" });
      const executionOrder: number[] = [];

      // Sync handler
      manager.on(HookEvents.AgentStart, () => {
        executionOrder.push(1);
      });

      // Async handler
      manager.on(HookEvents.AgentStart, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        executionOrder.push(2);
      });

      // Another sync handler
      manager.on(HookEvents.AgentStart, () => {
        executionOrder.push(3);
      });

      await manager.emit(HookEvents.AgentStart, { context });

      expect(executionOrder).toEqual([1, 2, 3]);
    });
  });

  describe("Sequential execution with error isolation", () => {
    it("runs handlers sequentially (not concurrently)", async () => {
      const manager = new HookManager(new SilentLogger());
      const context = new AgentContext({ agentName: "test" });
      const startTime = Date.now();

      manager.on(HookEvents.AgentStart, async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      manager.on(HookEvents.AgentStart, async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      manager.on(HookEvents.AgentStart, async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      await manager.emit(HookEvents.AgentStart, { context });

      const duration = Date.now() - startTime;

      // Should complete in ~60ms (sequential) not ~20ms (concurrent)
      expect(duration).toBeGreaterThanOrEqual(55);
    });
  });

  describe("Metadata propagation", () => {
    it("passes full payload to all handlers", async () => {
      const manager = new HookManager(new SilentLogger());
      const context = new AgentContext({ agentName: "test" });
      const tool = createTool("test-tool");
      const toolInput = { key: "value" };

      const handler = vi.fn();

      manager.on(HookEvents.BeforeTool, handler);

      const toolCallId = "test-tool-call-id";

      await manager.emit(HookEvents.BeforeTool, {
        context,
        tool,
        input: toolInput,
        toolCallId,
      });

      expect(handler).toHaveBeenCalledWith({
        context,
        tool,
        input: toolInput,
        toolCallId,
      });
      const firstCall = handler.mock.calls[0];
      expect(firstCall).toBeDefined();
      expect(firstCall?.[0].tool.name).toBe("test-tool");
      expect(firstCall?.[0].input).toEqual({ key: "value" });
    });
  });

  describe("Unregistration", () => {
    it("returns unregister function that removes handler", async () => {
      const manager = new HookManager();
      const context = new AgentContext({ agentName: "test" });
      const handler = vi.fn();

      const unregister = manager.on(HookEvents.AgentStart, handler);

      await manager.emit(HookEvents.AgentStart, { context });
      expect(handler).toHaveBeenCalledTimes(1);

      unregister();

      await manager.emit(HookEvents.AgentStart, { context });
      expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it("off removes specific handler", async () => {
      const manager = new HookManager();
      const context = new AgentContext({ agentName: "test" });
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      manager.on(HookEvents.AgentStart, handler1);
      manager.on(HookEvents.AgentStart, handler2);

      await manager.emit(HookEvents.AgentStart, { context });
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);

      manager.off(HookEvents.AgentStart, handler1);

      await manager.emit(HookEvents.AgentStart, { context });
      expect(handler1).toHaveBeenCalledTimes(1); // Not called again
      expect(handler2).toHaveBeenCalledTimes(2); // Called again
    });

    it("clear removes all handlers", async () => {
      const manager = new HookManager();
      const context = new AgentContext({ agentName: "test" });
      const handler = vi.fn();

      manager.on(HookEvents.AgentStart, handler);
      manager.on(HookEvents.AgentEnd, handler);

      await manager.emit(HookEvents.AgentStart, { context });
      expect(handler).toHaveBeenCalledTimes(1);

      manager.clear();

      await manager.emit(HookEvents.AgentStart, { context });
      await manager.emit(HookEvents.AgentEnd, { context });
      expect(handler).toHaveBeenCalledTimes(1); // Not called again
    });
  });

  describe("registerMany", () => {
    it("registers multiple hooks and returns cleanup function", async () => {
      const manager = new HookManager();
      const context = new AgentContext({ agentName: "test" });
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const cleanup = manager.registerMany([
        { event: HookEvents.AgentStart, handler: handler1 },
        { event: HookEvents.AgentEnd, handler: handler2 },
      ]);

      await manager.emit(HookEvents.AgentStart, { context });
      await manager.emit(HookEvents.AgentEnd, { context });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);

      cleanup();

      await manager.emit(HookEvents.AgentStart, { context });
      await manager.emit(HookEvents.AgentEnd, { context });

      expect(handler1).toHaveBeenCalledTimes(1); // Not called again
      expect(handler2).toHaveBeenCalledTimes(1); // Not called again
    });
  });

  describe("Empty event handling", () => {
    it("handles emit with no registered handlers", async () => {
      const manager = new HookManager();
      const context = new AgentContext({ agentName: "test" });

      // Should not throw
      await expect(
        manager.emit(HookEvents.AgentStart, { context }),
      ).resolves.toBeUndefined();
    });
  });
});
