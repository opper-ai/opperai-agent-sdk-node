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

// Helper to create a mock decision with all required fields
const createMockDecision = (
  overrides: Partial<AgentDecision> = {},
): AgentDecision => ({
  reasoning: "Mock reasoning",
  userMessage: "Working on it...",
  toolCalls: [],
  memoryReads: [],
  memoryUpdates: {},
  isComplete: false,
  ...overrides,
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
      const mockDecision = createMockDecision({
        reasoning: "Task is straightforward, no tools needed",
      });

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

      const mockDecision = createMockDecision({
        reasoning: "Generating greeting with timestamp",
      });

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
      const firstDecision = createMockDecision({
        reasoning: "Need to search for information",
        toolCalls: [
          {
            id: "call-1",
            toolName: "search",
            arguments: { query: "test query" },
          },
        ],
      });

      // Second think step - complete with results (empty toolCalls)
      const secondDecision = createMockDecision({
        reasoning: "Got search results, can now complete",
      });

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

      // Tool spans should be siblings to think spans (both children of agent execution span)
      expect(mockOpperClient.createSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "tool_search",
          parentSpanId: "mock-span-id", // Agent execution span, not think span
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

      const firstDecision = createMockDecision({
        reasoning: "Trying to use a tool",
        toolCalls: [
          {
            id: "call-1",
            toolName: "failing_tool",
            arguments: { input: "test" },
          },
        ],
      });

      const secondDecision = createMockDecision({
        reasoning: "Tool failed, but continuing anyway",
      });

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
      const firstDecision = createMockDecision({
        reasoning: "Trying to use non-existent tool",
        toolCalls: [
          {
            id: "call-1",
            toolName: "nonexistent_tool",
            arguments: {},
          },
        ],
      });

      const secondDecision = createMockDecision({
        reasoning: "Tool not found, completing anyway",
      });

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
      const neverCompleteDecision = createMockDecision({
        reasoning: "Need more iterations",
        toolCalls: [
          {
            id: "call-1",
            toolName: "dummy_tool",
            arguments: {},
          },
        ],
      });

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
      agent.registerHook(HookEvents.StreamEnd, ({ callType, fieldBuffers }) => {
        hookEvents.push({ event: "end", callType });
        if (callType === "think") {
          expect(fieldBuffers["reasoning"]).toBe("Task is complete");
        }
      });

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
      const firstDecision = createMockDecision({
        reasoning: "Task complete",
      });

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
      const mockDecision = createMockDecision({
        reasoning: "Complete immediately",
      });

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

    it("should pass userMessage in THINK_END hook", async () => {
      const mockDecision: AgentDecision = {
        reasoning: "Processing the request",
        userMessage: "Analyzing your question...",
        toolCalls: [],
        memoryReads: [],
        memoryUpdates: {},
        isComplete: false,
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
        name: "UserMessageAgent",
        opperClient: mockOpperClient,
      });

      let capturedThought: { reasoning: string; userMessage: string } | undefined;
      agent.registerHook(HookEvents.ThinkEnd, ({ thought }) => {
        capturedThought = thought as { reasoning: string; userMessage: string };
      });

      await agent.process({ task: "test" });

      expect(capturedThought).toBeDefined();
      expect(capturedThought?.reasoning).toBe("Processing the request");
      expect(capturedThought?.userMessage).toBe("Analyzing your question...");
    });

    it("should trigger tool hooks", async () => {
      const tool: Tool<{ input: string }, { output: string }> = {
        name: "test_tool",
        execute: async (input) =>
          ToolResultFactory.success("test_tool", {
            output: input.input.toUpperCase(),
          }),
      };

      const firstDecision = createMockDecision({
        reasoning: "Using tool",
        toolCalls: [
          {
            id: "call-1",
            toolName: "test_tool",
            arguments: { input: "hello" },
          },
        ],
      });

      const secondDecision = createMockDecision({
        reasoning: "Done",
      });

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
      const memoryDecision = createMockDecision({
        reasoning: "Store user preferences",
        memoryUpdates: {
          favorite_color: { value: "blue", description: "User favorite color" },
          favorite_number: { value: 42 },
        },
      });

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

  describe("Span timing and naming", () => {
    it("should rename think span to 'think' after call", async () => {
      const mockDecision = createMockDecision({
        reasoning: "Task complete",
      });

      const mockFinalResult = { done: true };

      vi.spyOn(mockOpperClient, "call")
        .mockResolvedValueOnce({
          jsonPayload: mockDecision,
          spanId: "think-span-123",
          usage: mockUsage(100, 50),
        })
        .mockResolvedValueOnce({
          jsonPayload: mockFinalResult,
          spanId: "final-span",
          usage: mockUsage(50, 25),
        });

      const updateSpanSpy = vi.spyOn(mockOpperClient, "updateSpan");

      const agent = new Agent({
        name: "TestAgent",
        opperClient: mockOpperClient,
      });

      await agent.process({ task: "test" });

      // Check that updateSpan was called to rename the think span
      expect(updateSpanSpy).toHaveBeenCalledWith(
        "think-span-123",
        undefined,
        expect.objectContaining({ name: "think" }),
      );
    });

    it("should include timing data when updating tool spans", async () => {
      const tool: Tool<{ query: string }, { results: string[] }> = {
        name: "search",
        execute: async () =>
          ToolResultFactory.success("search", { results: ["result1"] }),
      };

      const firstDecision = createMockDecision({
        reasoning: "Need to search",
        toolCalls: [
          { id: "call-1", toolName: "search", arguments: { query: "test" } },
        ],
      });

      const secondDecision = createMockDecision({
        reasoning: "Done",
      });

      const mockFinalResult = { answer: "Found it" };

      vi.spyOn(mockOpperClient, "call")
        .mockResolvedValueOnce({
          jsonPayload: firstDecision,
          spanId: "think-span-1",
          usage: mockUsage(100, 50),
        })
        .mockResolvedValueOnce({
          jsonPayload: secondDecision,
          spanId: "think-span-2",
          usage: mockUsage(100, 50),
        })
        .mockResolvedValueOnce({
          jsonPayload: mockFinalResult,
          spanId: "final-span",
          usage: mockUsage(50, 25),
        });

      const updateSpanSpy = vi.spyOn(mockOpperClient, "updateSpan");

      const agent = new Agent({
        name: "TimingAgent",
        tools: [tool],
        opperClient: mockOpperClient,
      });

      await agent.process({ task: "test" });

      // Find the call that updated the tool span (not the think span rename)
      const toolSpanUpdateCall = updateSpanSpy.mock.calls.find(
        (call) =>
          call[0] === "mock-span-id" &&
          call[2]?.startTime !== undefined &&
          call[2]?.endTime !== undefined,
      );

      expect(toolSpanUpdateCall).toBeDefined();
      if (toolSpanUpdateCall) {
        const options = toolSpanUpdateCall[2];
        expect(options?.startTime).toBeInstanceOf(Date);
        expect(options?.endTime).toBeInstanceOf(Date);
        expect(options?.meta?.["durationMs"]).toBeTypeOf("number");
      }
    });

    it("should include timing data when updating agent execution span", async () => {
      const mockDecision = createMockDecision({
        reasoning: "Immediate completion",
        isComplete: true,
        finalResult: { result: "done" },
      });

      vi.spyOn(mockOpperClient, "call").mockResolvedValueOnce({
        jsonPayload: mockDecision,
        spanId: "think-span",
        usage: mockUsage(100, 50),
      });

      const updateSpanSpy = vi.spyOn(mockOpperClient, "updateSpan");

      const agent = new Agent({
        name: "ExecutionTimingAgent",
        opperClient: mockOpperClient,
      });

      await agent.process({ task: "test" });

      // Find the call that updated the execution span with timing
      const executionSpanUpdateCall = updateSpanSpy.mock.calls.find(
        (call) =>
          call[0] === "mock-span-id" &&
          call[2]?.startTime !== undefined &&
          call[2]?.endTime !== undefined &&
          call[2]?.meta?.["durationMs"] !== undefined,
      );

      expect(executionSpanUpdateCall).toBeDefined();
      if (executionSpanUpdateCall) {
        const options = executionSpanUpdateCall[2];
        expect(options?.startTime).toBeInstanceOf(Date);
        expect(options?.endTime).toBeInstanceOf(Date);
        expect(options?.meta?.["durationMs"]).toBeTypeOf("number");
        expect(options?.meta?.["durationMs"]).toBeGreaterThanOrEqual(0);
      }
    });

    it("should include timing data when tool execution throws error", async () => {
      const failingTool: Tool<{ input: string }, { output: string }> = {
        name: "throwing_tool",
        description: "A tool that throws",
        execute: async () => {
          throw new Error("Tool execution exploded");
        },
      };

      const firstDecision = createMockDecision({
        reasoning: "Trying throwing tool",
        toolCalls: [
          { id: "call-1", toolName: "throwing_tool", arguments: { input: "test" } },
        ],
      });

      const secondDecision = createMockDecision({
        reasoning: "Tool failed, completing anyway",
      });

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

      const updateSpanSpy = vi.spyOn(mockOpperClient, "updateSpan");

      const agent = new Agent({
        name: "ErrorTimingAgent",
        tools: [failingTool],
        opperClient: mockOpperClient,
      });

      await agent.process({ task: "test" });

      // Find the call that updated the tool span with error and timing
      const errorSpanUpdateCall = updateSpanSpy.mock.calls.find(
        (call) =>
          call[0] === "mock-span-id" &&
          call[2]?.error !== undefined &&
          call[2]?.startTime !== undefined &&
          call[2]?.endTime !== undefined,
      );

      expect(errorSpanUpdateCall).toBeDefined();
      if (errorSpanUpdateCall) {
        const options = errorSpanUpdateCall[2];
        expect(options?.error).toContain("Tool execution exploded");
        expect(options?.startTime).toBeInstanceOf(Date);
        expect(options?.endTime).toBeInstanceOf(Date);
        expect(options?.meta?.["durationMs"]).toBeTypeOf("number");
      }
    });

    it("should include timing data on agent execution span when error occurs", async () => {
      // Always return a decision that requires more tools to force max iterations error
      const neverCompleteDecision = createMockDecision({
        reasoning: "Need more iterations",
        toolCalls: [
          { id: "call-1", toolName: "dummy_tool", arguments: {} },
        ],
      });

      const dummyTool: Tool<unknown, unknown> = {
        name: "dummy_tool",
        execute: async () => ToolResultFactory.success("dummy_tool", {}),
      };

      vi.spyOn(mockOpperClient, "call").mockResolvedValue({
        jsonPayload: neverCompleteDecision,
        spanId: "span-1",
        usage: mockUsage(100, 50),
      });

      const updateSpanSpy = vi.spyOn(mockOpperClient, "updateSpan");

      const agent = new Agent({
        name: "ErrorExecutionAgent",
        maxIterations: 2,
        tools: [dummyTool],
        opperClient: mockOpperClient,
      });

      await expect(agent.process({ task: "never ending" })).rejects.toThrow(
        /exceeded maximum iterations/,
      );

      // Find the call that updated the execution span with error and timing
      const errorExecutionSpanCall = updateSpanSpy.mock.calls.find(
        (call) =>
          call[0] === "mock-span-id" &&
          call[2]?.error !== undefined &&
          call[2]?.startTime !== undefined &&
          call[2]?.endTime !== undefined &&
          call[2]?.meta?.["durationMs"] !== undefined,
      );

      expect(errorExecutionSpanCall).toBeDefined();
      if (errorExecutionSpanCall) {
        const options = errorExecutionSpanCall[2];
        expect(options?.error).toContain("exceeded maximum iterations");
        expect(options?.startTime).toBeInstanceOf(Date);
        expect(options?.endTime).toBeInstanceOf(Date);
        expect(options?.meta?.["durationMs"]).toBeTypeOf("number");
      }
    });
  });

  describe("Span update batching", () => {
    it("should defer span updates until after tool execution completes", async () => {
      const updateSpanSpy = vi.spyOn(mockOpperClient, "updateSpan");

      const tool: Tool<{ query: string }, { results: string[] }> = {
        name: "search",
        execute: async () => {
          expect(updateSpanSpy).not.toHaveBeenCalled();
          return ToolResultFactory.success("search", { results: ["ok"] });
        },
      };

      const firstDecision = createMockDecision({
        reasoning: "Need to search",
        toolCalls: [
          { id: "call-1", toolName: "search", arguments: { query: "test" } },
        ],
      });

      const finalPayload = { answer: "done" };
      const secondDecision = createMockDecision({
        reasoning: "Done",
        isComplete: true,
        finalResult: finalPayload,
      });

      vi.spyOn(mockOpperClient, "call")
        .mockResolvedValueOnce({
          jsonPayload: firstDecision,
          spanId: "think-span-1",
          usage: mockUsage(100, 50),
        })
        .mockResolvedValueOnce({
          jsonPayload: secondDecision,
          spanId: "think-span-2",
          usage: mockUsage(80, 40),
        });

      const agent = new Agent({
        name: "DeferredSpanAgent",
        tools: [tool],
        opperClient: mockOpperClient,
      });

      const result = await agent.process({ task: "test" });
      expect(result).toBe(JSON.stringify(finalPayload));
      expect(updateSpanSpy).toHaveBeenCalled();
    });

    it("should not fail the agent when span updates reject", async () => {
      const mockDecision = createMockDecision({
        reasoning: "Immediate completion",
        isComplete: true,
        finalResult: { result: "ok" },
      });

      vi.spyOn(mockOpperClient, "call").mockResolvedValueOnce({
        jsonPayload: mockDecision,
        spanId: "think-span",
        usage: mockUsage(100, 50),
      });

      vi.spyOn(mockOpperClient, "updateSpan").mockRejectedValue(
        new Error("span update failed"),
      );

      const agent = new Agent({
        name: "SpanFailureAgent",
        opperClient: mockOpperClient,
      });

      const result = await agent.process({ task: "test" });
      expect(result).toBe(JSON.stringify({ result: "ok" }));
    });
  });

  describe("Span type tagging", () => {
    it("should create tool span with tool type", async () => {
      const tool: Tool<{ query: string }, { results: string[] }> = {
        name: "search",
        description: "Search for info",
        execute: async () =>
          ToolResultFactory.success("search", { results: ["result1"] }),
      };

      const firstDecision = createMockDecision({
        reasoning: "Need to search",
        toolCalls: [
          { id: "call-1", toolName: "search", arguments: { query: "test" } },
        ],
      });

      const secondDecision = createMockDecision({
        reasoning: "Done",
      });

      const mockFinalResult = { answer: "Found it" };

      vi.spyOn(mockOpperClient, "call")
        .mockResolvedValueOnce({
          jsonPayload: firstDecision,
          spanId: "think-span-1",
          usage: mockUsage(100, 50),
        })
        .mockResolvedValueOnce({
          jsonPayload: secondDecision,
          spanId: "think-span-2",
          usage: mockUsage(100, 50),
        })
        .mockResolvedValueOnce({
          jsonPayload: mockFinalResult,
          spanId: "final-span",
          usage: mockUsage(50, 25),
        });

      const createSpanSpy = vi.spyOn(mockOpperClient, "createSpan");

      const agent = new Agent({
        name: "ToolTypeAgent",
        tools: [tool],
        opperClient: mockOpperClient,
      });

      await agent.process({ task: "test" });

      // Find the createSpan call for the tool
      const toolSpanCall = createSpanSpy.mock.calls.find(
        (call) => call[0]?.name === "tool_search",
      );

      expect(toolSpanCall).toBeDefined();
      if (toolSpanCall) {
        expect(toolSpanCall[0]?.type).toBe("🔧 tool");
      }
    });

    it("should create agent-as-tool span with agent type", async () => {
      // Create a tool with isAgent metadata
      const agentTool: Tool<{ task: string }, { result: string }> = {
        name: "sub_agent",
        description: "A sub-agent tool",
        metadata: { isAgent: true },
        execute: async () =>
          ToolResultFactory.success("sub_agent", { result: "done" }),
      };

      const firstDecision = createMockDecision({
        reasoning: "Need to delegate to sub-agent",
        toolCalls: [
          { id: "call-1", toolName: "sub_agent", arguments: { task: "subtask" } },
        ],
      });

      const secondDecision = createMockDecision({
        reasoning: "Done",
      });

      const mockFinalResult = { answer: "Completed" };

      vi.spyOn(mockOpperClient, "call")
        .mockResolvedValueOnce({
          jsonPayload: firstDecision,
          spanId: "think-span-1",
          usage: mockUsage(100, 50),
        })
        .mockResolvedValueOnce({
          jsonPayload: secondDecision,
          spanId: "think-span-2",
          usage: mockUsage(100, 50),
        })
        .mockResolvedValueOnce({
          jsonPayload: mockFinalResult,
          spanId: "final-span",
          usage: mockUsage(50, 25),
        });

      const createSpanSpy = vi.spyOn(mockOpperClient, "createSpan");

      const agent = new Agent({
        name: "AgentTypeAgent",
        tools: [agentTool],
        opperClient: mockOpperClient,
      });

      await agent.process({ task: "test" });

      // Find the createSpan call for the agent tool
      const agentSpanCall = createSpanSpy.mock.calls.find(
        (call) => call[0]?.name === "tool_sub_agent",
      );

      expect(agentSpanCall).toBeDefined();
      if (agentSpanCall) {
        expect(agentSpanCall[0]?.type).toBe("🤖 agent");
      }
    });

    it("should create memory spans with memory type", async () => {
      const memoryDecision = createMockDecision({
        reasoning: "Store and read memory",
        memoryReads: ["existing_key"],
        memoryUpdates: {
          new_key: { value: "new_value", description: "A new entry" },
        },
      });

      const secondDecision = createMockDecision({
        reasoning: "Done with memory operations",
      });

      const mockFinalResult = { status: "memory operations complete" };

      vi.spyOn(mockOpperClient, "call")
        .mockResolvedValueOnce({
          jsonPayload: memoryDecision,
          spanId: "think-span",
          usage: mockUsage(80, 40),
        })
        .mockResolvedValueOnce({
          jsonPayload: secondDecision,
          spanId: "think-span-2",
          usage: mockUsage(80, 40),
        })
        .mockResolvedValueOnce({
          jsonPayload: mockFinalResult,
          message: JSON.stringify(mockFinalResult),
          spanId: "final-span",
          usage: mockUsage(30, 15),
        });

      const createSpanSpy = vi.spyOn(mockOpperClient, "createSpan");

      const agent = new Agent({
        name: "MemoryTypeAgent",
        enableMemory: true,
        opperClient: mockOpperClient,
      });

      await agent.process("Test memory types");

      // Find memory_read span
      const memoryReadSpanCall = createSpanSpy.mock.calls.find(
        (call) => call[0]?.name === "memory_read",
      );

      expect(memoryReadSpanCall).toBeDefined();
      if (memoryReadSpanCall) {
        expect(memoryReadSpanCall[0]?.type).toBe("🧠 memory");
      }

      // Find memory_write span
      const memoryWriteSpanCall = createSpanSpy.mock.calls.find(
        (call) => call[0]?.name === "memory_write",
      );

      expect(memoryWriteSpanCall).toBeDefined();
      if (memoryWriteSpanCall) {
        expect(memoryWriteSpanCall[0]?.type).toBe("🧠 memory");
      }
    });
  });

  describe("Memory span timing", () => {
    it("should include timing data for memory read operations", async () => {
      const memoryDecision = createMockDecision({
        reasoning: "Read from memory",
        memoryReads: ["user_preference"],
      });

      const secondDecision = createMockDecision({
        reasoning: "Done",
      });

      const mockFinalResult = { status: "done" };

      vi.spyOn(mockOpperClient, "call")
        .mockResolvedValueOnce({
          jsonPayload: memoryDecision,
          spanId: "think-span",
          usage: mockUsage(80, 40),
        })
        .mockResolvedValueOnce({
          jsonPayload: secondDecision,
          spanId: "think-span-2",
          usage: mockUsage(80, 40),
        })
        .mockResolvedValueOnce({
          jsonPayload: mockFinalResult,
          message: JSON.stringify(mockFinalResult),
          spanId: "final-span",
          usage: mockUsage(30, 15),
        });

      const updateSpanSpy = vi.spyOn(mockOpperClient, "updateSpan");

      const agent = new Agent({
        name: "MemoryReadTimingAgent",
        enableMemory: true,
        opperClient: mockOpperClient,
      });

      await agent.process("Test memory read timing");

      // Find the updateSpan call for memory_read with timing
      const memoryReadUpdateCall = updateSpanSpy.mock.calls.find(
        (call) =>
          call[0] === "mock-span-id" &&
          call[2]?.startTime !== undefined &&
          call[2]?.endTime !== undefined &&
          call[2]?.meta?.["durationMs"] !== undefined,
      );

      expect(memoryReadUpdateCall).toBeDefined();
      if (memoryReadUpdateCall) {
        const options = memoryReadUpdateCall[2];
        expect(options?.startTime).toBeInstanceOf(Date);
        expect(options?.endTime).toBeInstanceOf(Date);
        expect(options?.meta?.["durationMs"]).toBeTypeOf("number");
        expect(options?.meta?.["durationMs"]).toBeGreaterThanOrEqual(0);
      }
    });

    it("should include timing data for memory write operations", async () => {
      const memoryDecision = createMockDecision({
        reasoning: "Write to memory",
        memoryUpdates: {
          user_setting: { value: "dark_mode", description: "User theme preference" },
        },
      });

      const mockFinalResult = { status: "saved" };

      vi.spyOn(mockOpperClient, "call")
        .mockResolvedValueOnce({
          jsonPayload: memoryDecision,
          spanId: "think-span",
          usage: mockUsage(80, 40),
        })
        .mockResolvedValueOnce({
          jsonPayload: mockFinalResult,
          message: JSON.stringify(mockFinalResult),
          spanId: "final-span",
          usage: mockUsage(30, 15),
        });

      const updateSpanSpy = vi.spyOn(mockOpperClient, "updateSpan");

      const agent = new Agent({
        name: "MemoryWriteTimingAgent",
        enableMemory: true,
        opperClient: mockOpperClient,
      });

      await agent.process("Test memory write timing");

      // Find the updateSpan call for memory_write with timing
      const memoryWriteUpdateCall = updateSpanSpy.mock.calls.find(
        (call) =>
          call[0] === "mock-span-id" &&
          call[2]?.startTime !== undefined &&
          call[2]?.endTime !== undefined &&
          call[2]?.meta?.["durationMs"] !== undefined,
      );

      expect(memoryWriteUpdateCall).toBeDefined();
      if (memoryWriteUpdateCall) {
        const options = memoryWriteUpdateCall[2];
        expect(options?.startTime).toBeInstanceOf(Date);
        expect(options?.endTime).toBeInstanceOf(Date);
        expect(options?.meta?.["durationMs"]).toBeTypeOf("number");
      }
    });
  });

  describe("Streaming span naming", () => {
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

    it("should rename think span to 'think' in streaming mode", async () => {
      const thinkEvents = [
        { data: { spanId: "stream-think-span-123" } },
        {
          data: {
            delta: "Task complete",
            jsonPath: "reasoning",
            chunkType: "json",
          },
        },
      ];

      const finalEvents = [
        { data: { spanId: "stream-final-span" } },
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
            data: { totalTokens: 50 },
          },
        ],
      }));

      (mockOpperClient.getClient as Mock).mockReturnValue({
        spans: { get: mockSpansGet },
        traces: { get: mockTracesGet },
      });

      const updateSpanSpy = vi.spyOn(mockOpperClient, "updateSpan");

      const agent = new Agent({
        name: "StreamingRenameAgent",
        opperClient: mockOpperClient,
        enableStreaming: true,
      });

      await agent.process({ task: "test" });

      // Check that updateSpan was called to rename the streaming think span
      expect(updateSpanSpy).toHaveBeenCalledWith(
        "stream-think-span-123",
        undefined,
        expect.objectContaining({ name: "think" }),
      );
    });
  });
});
