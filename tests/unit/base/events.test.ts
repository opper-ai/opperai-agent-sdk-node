import { describe, expect, it, vi } from "vitest";

import { BaseAgent, type BaseAgentConfig } from "@/base/agent";
import { AgentContext } from "@/base/context";
import { AgentEvents } from "@/base/events";
import { HookEvents, type HookEventName } from "@/base/hooks";

// Test agent for verifying event registration
class TestAgent extends BaseAgent<string, string> {
  protected override async runLoop(
    input: string,
    context: AgentContext,
  ): Promise<string> {
    void context;
    return `Processed: ${input}`;
  }
}

describe("AgentEvents", () => {
  describe("Type compatibility with HookEvents", () => {
    it("AgentEvents includes all HookEvents", () => {
      // Runtime check that AgentEvents has all the same keys as HookEvents
      const hookEventKeys = Object.keys(HookEvents) as (keyof typeof HookEvents)[];
      const agentEventKeys = Object.keys(AgentEvents) as (keyof typeof AgentEvents)[];

      expect(agentEventKeys).toEqual(hookEventKeys);

      // Verify all values match
      for (const key of hookEventKeys) {
        expect(AgentEvents[key]).toBe(HookEvents[key]);
      }
    });

    it("AgentEvents values match HookEvents values", () => {
      // Verify each event value
      expect(AgentEvents.AgentStart).toBe("agent:start");
      expect(AgentEvents.AgentEnd).toBe("agent:end");
      expect(AgentEvents.LoopStart).toBe("loop:start");
      expect(AgentEvents.LoopEnd).toBe("loop:end");
      expect(AgentEvents.LlmCall).toBe("llm:call");
      expect(AgentEvents.LlmResponse).toBe("llm:response");
      expect(AgentEvents.ThinkEnd).toBe("think:end");
      expect(AgentEvents.BeforeTool).toBe("tool:before");
      expect(AgentEvents.AfterTool).toBe("tool:after");
      expect(AgentEvents.ToolError).toBe("tool:error");
      expect(AgentEvents.MemoryRead).toBe("memory:read");
      expect(AgentEvents.MemoryWrite).toBe("memory:write");
      expect(AgentEvents.MemoryError).toBe("memory:error");
      expect(AgentEvents.StreamStart).toBe("stream:start");
      expect(AgentEvents.StreamChunk).toBe("stream:chunk");
      expect(AgentEvents.StreamEnd).toBe("stream:end");
      expect(AgentEvents.StreamError).toBe("stream:error");
    });

    it("has all 17 hook events", () => {
      const allEvents = Object.values(AgentEvents);
      expect(allEvents).toHaveLength(17);
    });
  });

  describe("Type-level verification", () => {
    it("AgentEvents can be used where HookEvents is expected", () => {
      // This is a compile-time check - if this compiles, the types are compatible
      const acceptsHookEvent = (event: HookEventName): string => event;

      // All AgentEvents values should be accepted as HookEventName
      expect(acceptsHookEvent(AgentEvents.AgentStart)).toBe("agent:start");
      expect(acceptsHookEvent(AgentEvents.AgentEnd)).toBe("agent:end");
      expect(acceptsHookEvent(AgentEvents.LoopStart)).toBe("loop:start");
      expect(acceptsHookEvent(AgentEvents.LoopEnd)).toBe("loop:end");
      expect(acceptsHookEvent(AgentEvents.LlmCall)).toBe("llm:call");
      expect(acceptsHookEvent(AgentEvents.LlmResponse)).toBe("llm:response");
      expect(acceptsHookEvent(AgentEvents.ThinkEnd)).toBe("think:end");
      expect(acceptsHookEvent(AgentEvents.BeforeTool)).toBe("tool:before");
      expect(acceptsHookEvent(AgentEvents.AfterTool)).toBe("tool:after");
      expect(acceptsHookEvent(AgentEvents.ToolError)).toBe("tool:error");
      expect(acceptsHookEvent(AgentEvents.MemoryRead)).toBe("memory:read");
      expect(acceptsHookEvent(AgentEvents.MemoryWrite)).toBe("memory:write");
      expect(acceptsHookEvent(AgentEvents.MemoryError)).toBe("memory:error");
      expect(acceptsHookEvent(AgentEvents.StreamStart)).toBe("stream:start");
      expect(acceptsHookEvent(AgentEvents.StreamChunk)).toBe("stream:chunk");
      expect(acceptsHookEvent(AgentEvents.StreamEnd)).toBe("stream:end");
      expect(acceptsHookEvent(AgentEvents.StreamError)).toBe("stream:error");
    });

    it("HookEvents can be used where AgentEvents is expected", () => {
      // This verifies bidirectional compatibility
      type AgentEventName = (typeof AgentEvents)[keyof typeof AgentEvents];
      const acceptsAgentEvent = (event: AgentEventName): string => event;

      // All HookEvents values should be accepted as AgentEventName
      expect(acceptsAgentEvent(HookEvents.AgentStart)).toBe("agent:start");
      expect(acceptsAgentEvent(HookEvents.AgentEnd)).toBe("agent:end");
      expect(acceptsAgentEvent(HookEvents.LoopStart)).toBe("loop:start");
      expect(acceptsAgentEvent(HookEvents.LoopEnd)).toBe("loop:end");
      expect(acceptsAgentEvent(HookEvents.LlmCall)).toBe("llm:call");
      expect(acceptsAgentEvent(HookEvents.LlmResponse)).toBe("llm:response");
      expect(acceptsAgentEvent(HookEvents.ThinkEnd)).toBe("think:end");
      expect(acceptsAgentEvent(HookEvents.BeforeTool)).toBe("tool:before");
      expect(acceptsAgentEvent(HookEvents.AfterTool)).toBe("tool:after");
      expect(acceptsAgentEvent(HookEvents.ToolError)).toBe("tool:error");
      expect(acceptsAgentEvent(HookEvents.MemoryRead)).toBe("memory:read");
      expect(acceptsAgentEvent(HookEvents.MemoryWrite)).toBe("memory:write");
      expect(acceptsAgentEvent(HookEvents.MemoryError)).toBe("memory:error");
      expect(acceptsAgentEvent(HookEvents.StreamStart)).toBe("stream:start");
      expect(acceptsAgentEvent(HookEvents.StreamChunk)).toBe("stream:chunk");
      expect(acceptsAgentEvent(HookEvents.StreamEnd)).toBe("stream:end");
      expect(acceptsAgentEvent(HookEvents.StreamError)).toBe("stream:error");
    });
  });

  describe("Agent integration", () => {
    it("agent.on() accepts all HookEvents", () => {
      const agent = new TestAgent({ name: "events-test" });

      // This test verifies at compile-time and runtime that agent.on()
      // accepts all HookEvents values (not just streaming events)
      const handlers: Array<() => void> = [];

      // Register handlers for ALL events using agent.on() with HookEvents
      handlers.push(agent.on(HookEvents.AgentStart, vi.fn()));
      handlers.push(agent.on(HookEvents.AgentEnd, vi.fn()));
      handlers.push(agent.on(HookEvents.LoopStart, vi.fn()));
      handlers.push(agent.on(HookEvents.LoopEnd, vi.fn()));
      handlers.push(agent.on(HookEvents.LlmCall, vi.fn()));
      handlers.push(agent.on(HookEvents.LlmResponse, vi.fn()));
      handlers.push(agent.on(HookEvents.ThinkEnd, vi.fn()));
      handlers.push(agent.on(HookEvents.BeforeTool, vi.fn()));
      handlers.push(agent.on(HookEvents.AfterTool, vi.fn()));
      handlers.push(agent.on(HookEvents.ToolError, vi.fn()));
      handlers.push(agent.on(HookEvents.MemoryRead, vi.fn()));
      handlers.push(agent.on(HookEvents.MemoryWrite, vi.fn()));
      handlers.push(agent.on(HookEvents.MemoryError, vi.fn()));
      handlers.push(agent.on(HookEvents.StreamStart, vi.fn()));
      handlers.push(agent.on(HookEvents.StreamChunk, vi.fn()));
      handlers.push(agent.on(HookEvents.StreamEnd, vi.fn()));
      handlers.push(agent.on(HookEvents.StreamError, vi.fn()));

      // All 17 handlers should have been registered
      expect(handlers).toHaveLength(17);

      // All handlers should return unsubscribe functions
      handlers.forEach((unsubscribe) => {
        expect(typeof unsubscribe).toBe("function");
      });

      // Cleanup
      handlers.forEach((unsubscribe) => unsubscribe());
    });

    it("agent.registerHook() accepts all HookEvents", () => {
      const agent = new TestAgent({ name: "hooks-test" });

      // Register handlers for ALL events using registerHook with HookEvents
      const handlers: Array<() => void> = [];

      handlers.push(agent.registerHook(HookEvents.AgentStart, vi.fn()));
      handlers.push(agent.registerHook(HookEvents.AgentEnd, vi.fn()));
      handlers.push(agent.registerHook(HookEvents.LoopStart, vi.fn()));
      handlers.push(agent.registerHook(HookEvents.LoopEnd, vi.fn()));
      handlers.push(agent.registerHook(HookEvents.LlmCall, vi.fn()));
      handlers.push(agent.registerHook(HookEvents.LlmResponse, vi.fn()));
      handlers.push(agent.registerHook(HookEvents.ThinkEnd, vi.fn()));
      handlers.push(agent.registerHook(HookEvents.BeforeTool, vi.fn()));
      handlers.push(agent.registerHook(HookEvents.AfterTool, vi.fn()));
      handlers.push(agent.registerHook(HookEvents.ToolError, vi.fn()));
      handlers.push(agent.registerHook(HookEvents.MemoryRead, vi.fn()));
      handlers.push(agent.registerHook(HookEvents.MemoryWrite, vi.fn()));
      handlers.push(agent.registerHook(HookEvents.MemoryError, vi.fn()));
      handlers.push(agent.registerHook(HookEvents.StreamStart, vi.fn()));
      handlers.push(agent.registerHook(HookEvents.StreamChunk, vi.fn()));
      handlers.push(agent.registerHook(HookEvents.StreamEnd, vi.fn()));
      handlers.push(agent.registerHook(HookEvents.StreamError, vi.fn()));

      // All 17 handlers should have been registered
      expect(handlers).toHaveLength(17);

      // Cleanup
      handlers.forEach((unsubscribe) => unsubscribe());
    });

    it("registerHook() receives AgentStart/AgentEnd events", async () => {
      const agent = new TestAgent({ name: "hooks-events-test" });

      const hookStartHandler = vi.fn();
      const hookEndHandler = vi.fn();

      // Register lifecycle events via registerHook
      agent.registerHook(HookEvents.AgentStart, hookStartHandler);
      agent.registerHook(HookEvents.AgentEnd, hookEndHandler);

      await agent.process("test input");

      // registerHook should receive lifecycle events
      expect(hookStartHandler).toHaveBeenCalledOnce();
      expect(hookEndHandler).toHaveBeenCalledOnce();

      expect(hookStartHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({ agentName: "hooks-events-test" }),
        }),
      );
    });

    it("agent.on() receives AgentStart/AgentEnd events (unified with hooks)", async () => {
      const agent = new TestAgent({ name: "on-events-test" });

      const onStartHandler = vi.fn();
      const onEndHandler = vi.fn();

      // Register lifecycle events via on() - this should now work for ALL events
      agent.on(HookEvents.AgentStart, onStartHandler);
      agent.on(HookEvents.AgentEnd, onEndHandler);

      await agent.process("test input");

      // on() should now receive lifecycle events (previously only worked for streaming)
      expect(onStartHandler).toHaveBeenCalledOnce();
      expect(onEndHandler).toHaveBeenCalledOnce();

      expect(onStartHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({ agentName: "on-events-test" }),
        }),
      );

      expect(onEndHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({ agentName: "on-events-test" }),
          result: "Processed: test input",
        }),
      );
    });

    it("agent.on() and registerHook() are equivalent", async () => {
      const agent = new TestAgent({ name: "equivalence-test" });

      const onHandler = vi.fn();
      const hookHandler = vi.fn();

      // Register the same event with both methods
      agent.on(HookEvents.AgentEnd, onHandler);
      agent.registerHook(HookEvents.AgentEnd, hookHandler);

      await agent.process("test");

      // Both handlers should fire with the same payload
      expect(onHandler).toHaveBeenCalledOnce();
      expect(hookHandler).toHaveBeenCalledOnce();

      // They should receive the same arguments
      expect(onHandler.mock.calls[0]).toEqual(hookHandler.mock.calls[0]);
    });

    it("agent.once() fires handler only once", async () => {
      const agent = new TestAgent({ name: "once-test" });

      const onceHandler = vi.fn();

      // Register a one-time handler
      agent.once(HookEvents.AgentEnd, onceHandler);

      // First call - handler should fire
      await agent.process("first");
      expect(onceHandler).toHaveBeenCalledOnce();

      // Second call - handler should NOT fire again
      await agent.process("second");
      expect(onceHandler).toHaveBeenCalledOnce(); // Still just once
    });

    it("agent.off() removes handler", async () => {
      const agent = new TestAgent({ name: "off-test" });

      const handler = vi.fn();

      // Register handler
      agent.on(HookEvents.AgentEnd, handler);

      // First call - handler should fire
      await agent.process("first");
      expect(handler).toHaveBeenCalledOnce();

      // Remove handler
      agent.off(HookEvents.AgentEnd, handler);

      // Second call - handler should NOT fire
      await agent.process("second");
      expect(handler).toHaveBeenCalledOnce(); // Still just once
    });

    it("unsubscribe function from on() removes handler", async () => {
      const agent = new TestAgent({ name: "unsubscribe-test" });

      const handler = vi.fn();

      // Register handler and get unsubscribe function
      const unsubscribe = agent.on(HookEvents.AgentEnd, handler);

      // First call - handler should fire
      await agent.process("first");
      expect(handler).toHaveBeenCalledOnce();

      // Unsubscribe using returned function
      unsubscribe();

      // Second call - handler should NOT fire
      await agent.process("second");
      expect(handler).toHaveBeenCalledOnce(); // Still just once
    });
  });
});
