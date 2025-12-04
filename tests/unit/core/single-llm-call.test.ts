import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

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

describe("Agent - Single LLM Call Pattern", () => {
  let mockOpperClient: OpperClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOpperClient = new OpperClient();
  });

  it("should return immediate response with finalResult in single LLM call", async () => {
    // Mock decision with isComplete=true and finalResult
    const mockDecision = createMockDecision({
      reasoning: "This is a simple factual question I can answer directly",
      isComplete: true,
      finalResult: "The capital of France is Paris",
    });

    vi.spyOn(mockOpperClient, "call").mockResolvedValueOnce({
      jsonPayload: mockDecision,
      spanId: "span-think",
      usage: mockUsage(100, 50),
    });

    const agent = new Agent({
      name: "TestAgent",
      description: "Test agent",
      opperClient: mockOpperClient,
    });

    const result = await agent.process({
      task: "What is the capital of France?",
    });

    // Should return the final result directly
    expect(result).toBe("The capital of France is Paris");

    // Should only make ONE LLM call (no generate_final_result call)
    expect(mockOpperClient.call).toHaveBeenCalledTimes(1);
  });

  it("should validate finalResult against output schema", async () => {
    const OutputSchema = z.object({
      answer: z.string(),
      confidence: z.number(),
    });

    const mockDecision = createMockDecision({
      reasoning: "I can provide a direct answer with confidence",
      isComplete: true,
      finalResult: {
        answer: "Python is a high-level programming language",
        confidence: 0.95,
      },
    });

    vi.spyOn(mockOpperClient, "call").mockResolvedValueOnce({
      jsonPayload: mockDecision,
      spanId: "span-think",
      usage: mockUsage(120, 60),
    });

    const agent = new Agent({
      name: "TestAgent",
      description: "Test agent",
      opperClient: mockOpperClient,
      outputSchema: OutputSchema,
    });

    const result = await agent.process({ task: "What is Python?" });

    // Should return validated result
    expect(result).toEqual({
      answer: "Python is a high-level programming language",
      confidence: 0.95,
    });

    // Only one LLM call
    expect(mockOpperClient.call).toHaveBeenCalledTimes(1);
  });

  it("should use tools first, then provide finalResult in next think call", async () => {
    const OutputSchema = z.object({
      result: z.number(),
      explanation: z.string(),
    });

    // First call: decide to use tool
    const firstDecision = createMockDecision({
      reasoning: "I need to calculate this sum",
      isComplete: false,
      finalResult: undefined,
      toolCalls: [
        {
          id: "call-1",
          toolName: "add",
          arguments: { a: 5, b: 3 },
        },
      ],
    });

    // Second call: task complete with result
    const secondDecision = createMockDecision({
      reasoning: "I have calculated the sum successfully",
      isComplete: true,
      finalResult: { result: 8, explanation: "5 + 3 = 8" },
    });

    vi.spyOn(mockOpperClient, "call")
      .mockResolvedValueOnce({
        jsonPayload: firstDecision,
        spanId: "span-think-1",
        usage: mockUsage(80, 40),
      })
      .mockResolvedValueOnce({
        jsonPayload: secondDecision,
        spanId: "span-think-2",
        usage: mockUsage(90, 45),
      });

    // Mock tool
    const addTool = {
      name: "add",
      description: "Add two numbers",
      schema: z.object({ a: z.number(), b: z.number() }),
      execute: vi.fn().mockResolvedValue({ success: true, result: 8 }),
    };

    const agent = new Agent({
      name: "MathAgent",
      description: "Math agent",
      opperClient: mockOpperClient,
      tools: [addTool],
      outputSchema: OutputSchema,
    });

    const result = await agent.process({ task: "What is 5 + 3?" });

    // Should return validated result
    expect(result).toEqual({ result: 8, explanation: "5 + 3 = 8" });

    // Should make exactly 2 LLM calls (two think calls, no generate_final_result)
    expect(mockOpperClient.call).toHaveBeenCalledTimes(2);

    // Tool should have been executed
    expect(addTool.execute).toHaveBeenCalledTimes(1);
  });

  it("should support backward compatibility (empty toolCalls without finalResult)", async () => {
    // Old-style response: no isComplete/finalResult fields
    const firstDecision = createMockDecision({
      reasoning: "Task is done",
      // Empty toolCalls means complete in old pattern
      isComplete: false, // defaults to false, finalResult defaults to undefined
    });

    const mockFinalResult = "The task has been completed successfully";

    vi.spyOn(mockOpperClient, "call")
      .mockResolvedValueOnce({
        jsonPayload: firstDecision,
        spanId: "span-think",
        usage: mockUsage(70, 35),
      })
      .mockResolvedValueOnce({
        jsonPayload: mockFinalResult,
        message: mockFinalResult,
        spanId: "span-final",
        usage: mockUsage(50, 25),
      });

    const agent = new Agent({
      name: "BackwardCompatAgent",
      description: "Test backward compat",
      opperClient: mockOpperClient,
    });

    const result = await agent.process({ task: "Do something" });

    // Should still work and return result
    expect(result).toBe(mockFinalResult);

    // Should make 2 calls (think + generate_final_result for backward compat)
    expect(mockOpperClient.call).toHaveBeenCalledTimes(2);
  });

  it("should verify schema has new fields", () => {
    // Test that AgentDecision type includes new fields
    const decision = createMockDecision({
      isComplete: true,
      finalResult: { test: "value" },
    });

    expect(decision.isComplete).toBe(true);
    expect(decision.finalResult).toEqual({ test: "value" });
  });
});
