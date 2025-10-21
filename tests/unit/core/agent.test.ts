import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { z } from "zod";

import type { AgentContext } from "../../../src/base/context";
import { HookEvents } from "../../../src/base/hooks";
import { ToolResultFactory, type Tool } from "../../../src/base/tool";
import { Agent } from "../../../src/core/agent";
import type { AgentDecision } from "../../../src/core/schemas";
import { OpperClient } from "../../../src/opper/client";

// Helper to create mock usage with cost
const mockUsage = (inputTokens: number, outputTokens: number) => ({
  inputTokens,
  outputTokens,
  totalTokens: inputTokens + outputTokens,
  cost: {
    generation: 0,
    platform: 0,
    total: 0,
  },
});

// Mock OpperClient
vi.mock("../../../src/opper/client", () => {
  const OpperClient = vi.fn();
  OpperClient.prototype.call = vi.fn();
  OpperClient.prototype.createSpan = vi
    .fn()
    .mockResolvedValue({ id: "mock-span-id", name: "mock-span" });
  OpperClient.prototype.updateSpan = vi.fn().mockResolvedValue(undefined);
  OpperClient.prototype.stream = vi.fn();
  OpperClient.prototype.getClient = vi.fn();
  return { OpperClient };
});

describe("Agent", () => {
  let mockOpperClient: OpperClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOpperClient = new OpperClient();
  });

  describe("Basic agent execution", () => {
    it("should complete simple task without tools", async () => {
      // Mock Opper response for think step - immediate completion (empty toolCalls)
      const mockDecision: AgentDecision = {
        reasoning: "Task is straightforward, no tools needed",
        toolCalls: [],
        memoryReads: [],
        memoryUpdates: {},
      };

      // Mock final result generation
      const mockFinalResult = { result: "Task completed successfully" };

      vi.spyOn(mockOpperClient, "call")
        .mockResolvedValueOnce({
          // First call: think step
          jsonPayload: mockDecision,
          spanId: "span-think",
          usage: mockUsage(100, 50),
        })
        .mockResolvedValueOnce({
          // Second call: generate_final_result
          jsonPayload: mockFinalResult,
          message: "Task completed successfully",
          spanId: "span-final",
          usage: mockUsage(50, 25),
        });

      const agent = new Agent({
        name: "SimpleAgent",
        description: "A simple test agent",
        instructions: "Complete the task",
        opperClient: mockOpperClient,
      });

      let capturedContext: AgentContext | undefined;
      agent.registerHook("agent:end", ({ context }) => {
        capturedContext = context;
      });

      const result = await agent.process({ task: "say hello" });

      // Without outputSchema, result is the plain text message
      expect(result).toEqual("Task completed successfully");
      expect(mockOpperClient.call).toHaveBeenCalledTimes(2); // think + generate_final_result
      expect(capturedContext).toBeDefined();
      if (!capturedContext) {
        throw new Error("Expected agent:end to provide context");
      }
      expect(capturedContext.executionHistory).toHaveLength(1);
      expect(capturedContext.iteration).toBe(1);
    });

    it("should validate output with schema", async () => {
      const OutputSchema = z.object({
        greeting: z.string(),
        timestamp: z.number(),
      });

      const mockDecision: AgentDecision = {
        reasoning: "Generating greeting with timestamp",
        toolCalls: [],
        memoryReads: [],
        memoryUpdates: {},
      };

      const mockFinalResult = {
        greeting: "Hello, world!",
        timestamp: Date.now(),
      };

      vi.spyOn(mockOpperClient, "call")
        .mockResolvedValueOnce({
          // Think step
          jsonPayload: mockDecision,
          spanId: "span-think",
          usage: mockUsage(100, 50),
        })
        .mockResolvedValueOnce({
          // Generate final result
          jsonPayload: mockFinalResult,
          spanId: "span-final",
          usage: mockUsage(50, 25),
        });

      const agent = new Agent({
        name: "GreetingAgent",
        opperClient: mockOpperClient,
        outputSchema: OutputSchema,
      });

      const result = await agent.process({ name: "Alice" });

      expect(result).toHaveProperty("greeting");
      expect(result).toHaveProperty("timestamp");
      expect(typeof result.greeting).toBe("string");
      expect(typeof result.timestamp).toBe("number");
    });
  });

  describe("Tool execution", () => {
    it("should execute tools and complete", async () => {
      // Create a mock tool
      const searchTool: Tool<{ query: string }, { results: string[] }> = {
        name: "search",
        description: "Search for information",
        schema: z.object({ query: z.string() }),
        execute: async (input) => {
          return ToolResultFactory.success("search", {
            results: [`Result for: ${input.query}`],
          });
        },
      };

      // First think step - decide to use tool
      const firstDecision: AgentDecision = {
        reasoning: "Need to search for information",
        toolCalls: [
          {
            id: "call-1",
            toolName: "search",
            arguments: { query: "test query" },
          },
        ],
        memoryReads: [],
        memoryUpdates: {},
      };

      // Second think step - complete with results (empty toolCalls)
      const secondDecision: AgentDecision = {
        reasoning: "Got search results, can now complete",
        toolCalls: [],
        memoryReads: [],
        memoryUpdates: {},
      };

      const mockFinalResult = { answer: "Found information", source: "search" };

      vi.spyOn(mockOpperClient, "call")
        .mockResolvedValueOnce({
          // First think
          jsonPayload: firstDecision,
          spanId: "span-1",
          usage: mockUsage(100, 50),
        })
        .mockResolvedValueOnce({
          // Second think (after tool execution)
          jsonPayload: secondDecision,
          spanId: "span-2",
          usage: mockUsage(120, 60),
        })
        .mockResolvedValueOnce({
          // Final result generation
          jsonPayload: mockFinalResult,
          message: JSON.stringify(mockFinalResult),
          spanId: "span-3",
          usage: mockUsage(50, 25),
        });

      const agent = new Agent({
        name: "SearchAgent",
        tools: [searchTool],
        opperClient: mockOpperClient,
      });

      let capturedContext: AgentContext | undefined;
      agent.registerHook("agent:end", ({ context }) => {
        capturedContext = context;
      });

      const result = await agent.process({ question: "What is TypeScript?" });

      // Without outputSchema, message is returned (which is JSON string in this case)
      expect(result).toEqual(JSON.stringify(mockFinalResult));
      expect(mockOpperClient.call).toHaveBeenCalledTimes(3); // 2 thinks + 1 final result
      expect(capturedContext).toBeDefined();
      if (!capturedContext) {
        throw new Error("Expected agent:end to provide context");
      }
      expect(capturedContext.executionHistory).toHaveLength(2);

      expect(mockOpperClient.createSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "tool_search",
          parentSpanId: "span-1",
        }),
      );
    });

    it("should handle tool failures gracefully", async () => {
      const failingTool: Tool<{ input: string }, { output: string }> = {
        name: "failing_tool",
        description: "A tool that fails",
        execute: async () => {
          return ToolResultFactory.failure(
            "failing_tool",
            new Error("Tool failed"),
          );
        },
      };

      const firstDecision: AgentDecision = {
        reasoning: "Trying to use a tool",
        toolCalls: [
          {
            id: "call-1",
            toolName: "failing_tool",
            arguments: { input: "test" },
          },
        ],
        memoryReads: [],
        memoryUpdates: {},
      };

      const secondDecision: AgentDecision = {
        reasoning: "Tool failed, but continuing anyway",
        toolCalls: [],
        memoryReads: [],
        memoryUpdates: {},
      };

      const mockFinalResult = { status: "completed with errors" };

      vi.spyOn(mockOpperClient, "call")
        .mockResolvedValueOnce({
          jsonPayload: firstDecision,
          spanId: "span-1",
          usage: mockUsage(100, 50),
        })
        .mockResolvedValueOnce({
          jsonPayload: secondDecision,
          spanId: "span-2",
          usage: mockUsage(120, 60),
        })
        .mockResolvedValueOnce({
          jsonPayload: mockFinalResult,
          message: JSON.stringify(mockFinalResult),
          spanId: "span-3",
          usage: mockUsage(50, 25),
        });

      const agent = new Agent({
        name: "ResilientAgent",
        tools: [failingTool],
        opperClient: mockOpperClient,
      });

      let capturedContext: AgentContext | undefined;
      agent.registerHook("agent:end", ({ context }) => {
        capturedContext = context;
      });

      const result = await agent.process({ task: "test" });

      // Without outputSchema, message is returned (which is JSON string in this case)
      expect(result).toEqual(JSON.stringify(mockFinalResult));
      expect(mockOpperClient.call).toHaveBeenCalledTimes(3);
      expect(capturedContext).toBeDefined();
      if (!capturedContext) {
        throw new Error("Expected agent:end to provide context");
      }
      expect(capturedContext.toolCalls).toHaveLength(1);
      expect(capturedContext.toolCalls[0]?.success).toBe(false);
      expect(capturedContext.executionHistory).toHaveLength(2);
    });

    it("should handle tool not found error", async () => {
      const firstDecision: AgentDecision = {
        reasoning: "Trying to use non-existent tool",
        toolCalls: [
          {
            id: "call-1",
            toolName: "nonexistent_tool",
            arguments: {},
          },
        ],
        memoryReads: [],
        memoryUpdates: {},
      };

      const secondDecision: AgentDecision = {
        reasoning: "Tool not found, completing anyway",
        toolCalls: [],
        memoryReads: [],
        memoryUpdates: {},
      };

      const mockFinalResult = { status: "completed" };

      vi.spyOn(mockOpperClient, "call")
        .mockResolvedValueOnce({
          jsonPayload: firstDecision,
          spanId: "span-1",
          usage: mockUsage(100, 50),
        })
        .mockResolvedValueOnce({
          jsonPayload: secondDecision,
          spanId: "span-2",
          usage: mockUsage(120, 60),
        })
        .mockResolvedValueOnce({
          jsonPayload: mockFinalResult,
          message: JSON.stringify(mockFinalResult),
          spanId: "span-3",
          usage: mockUsage(50, 25),
        });

      const agent = new Agent({
        name: "TestAgent",
        opperClient: mockOpperClient,
      });

      let capturedContext: AgentContext | undefined;
      agent.registerHook("agent:end", ({ context }) => {
        capturedContext = context;
      });

      const result = await agent.process({ task: "test" });

      // Without outputSchema, message is returned (which is JSON string in this case)
      expect(result).toEqual(JSON.stringify(mockFinalResult));
      expect(mockOpperClient.call).toHaveBeenCalledTimes(3);
      expect(capturedContext).toBeDefined();
      if (!capturedContext) {
        throw new Error("Expected agent:end to provide context");
      }
      expect(capturedContext.toolCalls).toHaveLength(1);
      expect(capturedContext.toolCalls[0]?.success).toBe(false);
      expect(capturedContext.toolCalls[0]?.error).toContain("not found");
      expect(capturedContext.executionHistory).toHaveLength(2);
    });
  });

  describe("Max iterations", () => {
    it("should throw error when max iterations exceeded", async () => {
      // Always return a decision that requires more tools
      const neverCompleteDecision: AgentDecision = {
        reasoning: "Need more iterations",
        toolCalls: [
          {
            id: "call-1",
            toolName: "dummy_tool",
            arguments: {},
          },
        ],
        memoryReads: [],
        memoryUpdates: {},
      };

      const dummyTool: Tool<unknown, unknown> = {
        name: "dummy_tool",
        execute: async () => ToolResultFactory.success("dummy_tool", {}),
      };

      vi.spyOn(mockOpperClient, "call").mockResolvedValue({
        jsonPayload: neverCompleteDecision,
        spanId: "span-1",
        usage: mockUsage(100, 50),
      });

      const agent = new Agent({
        name: "InfiniteAgent",
        maxIterations: 3,
        tools: [dummyTool],
        opperClient: mockOpperClient,
      });

      await expect(agent.process({ task: "never ending" })).rejects.toThrow(
        /exceeded maximum iterations/,
      );
    });
  });

  describe("Streaming support", () => {
    const createStreamResponse = (
      events: Array<{ data: Record<string, unknown> }>,
    ) => ({
      headers: {},
      result: {
        async *[Symbol.asyncIterator]() {
          for (const event of events) {
            yield event;
          }
        },
      },
    });

    it("streams think and final result with usage tracking", async () => {
      const thinkEvents = [
        { data: { spanId: "span-think" } },
        {
          data: {
            delta: "Task is complete",
            jsonPath: "reasoning",
            chunkType: "json",
          },
        },
      ];

      const finalEvents = [
        { data: { spanId: "span-final" } },
        {
          data: {
            delta: "Task done",
            chunkType: "text",
          },
        },
      ];

      vi.spyOn(mockOpperClient, "stream")
        .mockResolvedValueOnce(createStreamResponse(thinkEvents))
        .mockResolvedValueOnce(createStreamResponse(finalEvents));

      const mockSpansGet = vi.fn(async (spanId: string) => ({
        id: spanId,
        traceId: `trace-${spanId}`,
      }));
      const mockTracesGet = vi.fn(async (traceId: string) => ({
        spans: [
          {
            id: traceId.replace("trace-", ""),
            data: {
              totalTokens: traceId.includes("think") ? 42 : 18,
            },
          },
        ],
      }));

      (mockOpperClient.getClient as Mock).mockReturnValue({
        spans: { get: mockSpansGet },
        traces: { get: mockTracesGet },
      });

      const agent = new Agent({
        name: "StreamingAgent",
        opperClient: mockOpperClient,
        enableStreaming: true,
      });

      const hookEvents: Array<{ event: string; callType: string }> = [];
      agent.registerHook(HookEvents.StreamStart, ({ callType }) => {
        hookEvents.push({ event: "start", callType });
      });
      agent.registerHook(
        HookEvents.StreamEnd,
        ({ callType, fieldBuffers }) => {
          hookEvents.push({ event: "end", callType });
          if (callType === "think") {
            expect(fieldBuffers["reasoning"]).toBe("Task is complete");
          }
        },
      );

      const emitterSpy = vi.fn();
      agent.on(HookEvents.StreamChunk, (payload) => {
        emitterSpy(payload.callType);
      });

      let capturedContext: AgentContext | undefined;
      agent.registerHook(HookEvents.AgentEnd, ({ context }) => {
        capturedContext = context;
      });

      const result = await agent.process({ task: "complete" });

      expect(result).toBe("Task done");
      expect(mockOpperClient.call).not.toHaveBeenCalled();
      expect(mockOpperClient.stream).toHaveBeenCalledTimes(2);
      expect(mockSpansGet).toHaveBeenCalledWith("span-think");
      expect(mockTracesGet).toHaveBeenCalledWith("trace-span-think");
      expect(emitterSpy).toHaveBeenCalledWith("think");
      expect(emitterSpy).toHaveBeenCalledWith("final_result");

      expect(hookEvents).toEqual([
        { event: "start", callType: "think" },
        { event: "end", callType: "think" },
        { event: "start", callType: "final_result" },
        { event: "end", callType: "final_result" },
      ]);

      expect(capturedContext).toBeDefined();
      if (!capturedContext) {
        throw new Error("Expected context to be captured");
      }

      expect(capturedContext.usage.requests).toBe(2);
      expect(capturedContext.usage.totalTokens).toBe(60);
    });

    it("registers streaming handlers through configuration", async () => {
      const thinkEvents = [
        { data: { spanId: "span-think-config" } },
        {
          data: {
            delta: "Reasoning chunk",
            jsonPath: "reasoning",
            chunkType: "json",
          },
        },
      ];

      const finalEvents = [
        { data: { spanId: "span-final-config" } },
        {
          data: {
            delta: "Done",
            chunkType: "text",
          },
        },
      ];

      vi.spyOn(mockOpperClient, "stream")
        .mockResolvedValueOnce(createStreamResponse(thinkEvents))
        .mockResolvedValueOnce(createStreamResponse(finalEvents));

      const mockSpansGet = vi.fn(async (spanId: string) => ({
        id: spanId,
        traceId: `trace-${spanId}`,
      }));
      const mockTracesGet = vi.fn(async (traceId: string) => ({
        spans: [
          {
            id: traceId.replace("trace-", ""),
            data: {
              totalTokens: 10,
            },
          },
        ],
      }));

      (mockOpperClient.getClient as Mock).mockReturnValue({
        spans: { get: mockSpansGet },
        traces: { get: mockTracesGet },
      });

      const onStart = vi.fn();
      const onChunk = vi.fn();
      const onEnd = vi.fn();
      const onError = vi.fn();

      const agent = new Agent({
        name: "StreamingHandlersAgent",
        opperClient: mockOpperClient,
        enableStreaming: true,
        onStreamStart: onStart,
        onStreamChunk: onChunk,
        onStreamEnd: onEnd,
        onStreamError: onError,
      });

      const result = await agent.process({ task: "complete via config" });

      expect(result).toBe("Done");
      expect(mockOpperClient.call).not.toHaveBeenCalled();
      expect(mockOpperClient.stream).toHaveBeenCalledTimes(2);
      expect(onStart).toHaveBeenCalledTimes(2);
      expect(onStart).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ callType: "think" }),
      );
      expect(onStart).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ callType: "final_result" }),
      );
      expect(onChunk).toHaveBeenCalledTimes(2);
      expect(onChunk).toHaveBeenCalledWith(
        expect.objectContaining({ callType: "think" }),
      );
      expect(onChunk).toHaveBeenCalledWith(
        expect.objectContaining({ callType: "final_result" }),
      );
      expect(onEnd).toHaveBeenCalledTimes(2);
      expect(onEnd).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ callType: "think" }),
      );
      expect(onEnd).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ callType: "final_result" }),
      );
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe("Context and usage tracking", () => {
    it("should track token usage across iterations", async () => {
      const firstDecision: AgentDecision = {
        reasoning: "Task complete",
        toolCalls: [],
        memoryReads: [],
        memoryUpdates: {},
      };

      const mockFinalResult = { done: true };

      vi.spyOn(mockOpperClient, "call")
        .mockResolvedValueOnce({
          // Think step
          jsonPayload: firstDecision,
          spanId: "span-1",
          usage: mockUsage(100, 50),
        })
        .mockResolvedValueOnce({
          // Generate final result
          jsonPayload: mockFinalResult,
          spanId: "span-2",
          usage: mockUsage(120, 60),
        });

      const agent = new Agent({
        name: "TrackingAgent",
        opperClient: mockOpperClient,
      });

      let capturedContext: AgentContext | undefined;
      agent.registerHook("agent:end", ({ context }) => {
        capturedContext = context;
      });

      await agent.process({ task: "test" });

      expect(capturedContext).toBeDefined();
      if (!capturedContext) {
        throw new Error("Expected context to be captured");
      }

      expect(capturedContext.usage.requests).toBe(2);
      expect(capturedContext.usage.totalTokens).toBe(330); // 150 + 180
    });
  });

  describe("Hooks integration", () => {
    it("should trigger agent lifecycle hooks", async () => {
      const mockDecision: AgentDecision = {
        reasoning: "Complete immediately",
        toolCalls: [],
        memoryReads: [],
        memoryUpdates: {},
      };

      const mockFinalResult = { result: "done" };

      vi.spyOn(mockOpperClient, "call")
        .mockResolvedValueOnce({
          jsonPayload: mockDecision,
          spanId: "span-1",
          usage: mockUsage(100, 50),
        })
        .mockResolvedValueOnce({
          jsonPayload: mockFinalResult,
          spanId: "span-2",
          usage: mockUsage(50, 25),
        });

      const agent = new Agent({
        name: "HookAgent",
        opperClient: mockOpperClient,
      });

      const startHook = vi.fn();
      const endHook = vi.fn();

      agent.registerHook("agent:start", startHook);
      agent.registerHook("agent:end", endHook);

      await agent.process({ task: "test" });

      expect(startHook).toHaveBeenCalledTimes(1);
      expect(endHook).toHaveBeenCalledTimes(1);
    });

    it("should trigger tool hooks", async () => {
      const tool: Tool<{ input: string }, { output: string }> = {
        name: "test_tool",
        execute: async (input) =>
          ToolResultFactory.success("test_tool", {
            output: input.input.toUpperCase(),
          }),
      };

      const firstDecision: AgentDecision = {
        reasoning: "Using tool",
        toolCalls: [
          {
            id: "call-1",
            toolName: "test_tool",
            arguments: { input: "hello" },
          },
        ],
        memoryReads: [],
        memoryUpdates: {},
      };

      const secondDecision: AgentDecision = {
        reasoning: "Done",
        toolCalls: [],
        memoryReads: [],
        memoryUpdates: {},
      };

      const mockFinalResult = { result: "HELLO" };

      vi.spyOn(mockOpperClient, "call")
        .mockResolvedValueOnce({
          jsonPayload: firstDecision,
          spanId: "span-1",
          usage: mockUsage(100, 50),
        })
        .mockResolvedValueOnce({
          jsonPayload: secondDecision,
          spanId: "span-2",
          usage: mockUsage(100, 50),
        })
        .mockResolvedValueOnce({
          jsonPayload: mockFinalResult,
          spanId: "span-3",
          usage: mockUsage(50, 25),
        });

      const agent = new Agent({
        name: "ToolHookAgent",
        tools: [tool],
        opperClient: mockOpperClient,
      });

      const beforeToolHook = vi.fn();
      const afterToolHook = vi.fn();

      agent.registerHook("tool:before", beforeToolHook);
      agent.registerHook("tool:after", afterToolHook);

      await agent.process({ task: "test" });

      expect(beforeToolHook).toHaveBeenCalledTimes(1);
      expect(afterToolHook).toHaveBeenCalledTimes(1);
    });
  });

  describe("Memory integration", () => {
    it("records memory operations in execution history and final context", async () => {
      const memoryDecision: AgentDecision = {
        reasoning: "Store user preferences",
        toolCalls: [],
        memoryReads: [],
        memoryUpdates: {
          favorite_color: { value: "blue", description: "User favorite color" },
          favorite_number: { value: 42 },
        },
      };

      const finalResult = {
        summary: "Stored preferences",
      };

      vi.spyOn(mockOpperClient, "call")
        .mockResolvedValueOnce({
          // Think response with memory updates
          jsonPayload: memoryDecision,
          spanId: "span-think",
          usage: mockUsage(80, 40),
        })
        .mockResolvedValueOnce({
          // Final result generation
          jsonPayload: finalResult,
          message: JSON.stringify(finalResult),
          spanId: "span-final",
          usage: mockUsage(30, 15),
        });

      const agent = new Agent({
        name: "MemoryAgent",
        description: "Remembers preferences",
        enableMemory: true,
        opperClient: mockOpperClient,
      });

      let capturedContext: AgentContext | undefined;
      agent.registerHook("agent:end", ({ context }) => {
        capturedContext = context;
      });

      const result = await agent.process("Remember preferences");
      expect(result).toEqual(JSON.stringify(finalResult));

      const callMock = mockOpperClient.call as unknown as Mock;
      expect(callMock).toHaveBeenCalledTimes(2);

      // Final call input should include memory write in execution history
      const finalCallArgs = callMock.mock.calls[1]?.[0];
      if (!finalCallArgs) {
        throw new Error("Expected final Opper call arguments");
      }
      const finalInput = finalCallArgs.input as {
        execution_history: Array<{
          actions_taken: string[];
          results: Array<{ tool: string; result: string }>;
        }>;
      };

      expect(finalInput.execution_history).toHaveLength(1);
      const firstHistoryEntry = finalInput.execution_history[0];
      if (!firstHistoryEntry) {
        throw new Error("Expected execution history entry");
      }
      expect(firstHistoryEntry.actions_taken).toContain("memory_write");
      expect(firstHistoryEntry.results).not.toHaveLength(0);
      expect(firstHistoryEntry.results[0]!.tool).toBe("memory_write");

      expect(capturedContext).toBeDefined();
      if (!capturedContext) throw new Error("Expected context");

      expect(capturedContext.executionHistory).toHaveLength(1);
      const cycle = capturedContext.executionHistory[0];
      if (!cycle) {
        throw new Error("Expected execution cycle");
      }
      expect(cycle.results).toHaveLength(1);
      expect((cycle.results[0] as { toolName?: string }).toolName).toBe(
        "memory_write",
      );
    });
  });
});
