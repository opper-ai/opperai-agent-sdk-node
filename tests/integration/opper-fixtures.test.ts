/**
 * Fixture-based integration tests for Opper client
 * These tests verify we correctly parse real Opper API responses
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";

import { loadFixture } from "../utils/fixtures";

import { OpperClient } from "@/opper/client";
import { SilentLogger } from "@/utils/logger";

interface FixtureUsageDetails {
  output_tokens: number;
  input_tokens: number;
  total_tokens: number;
  output_tokens_details?: Record<string, number>;
  input_tokens_details?: Record<string, number>;
}

interface FixtureCost {
  generation: number;
  platform: number;
  total: number;
}

interface CallFixture {
  spanId: string;
  message?: string;
  cached: boolean;
  usage: FixtureUsageDetails;
  cost: FixtureCost;
  jsonPayload?: Record<string, unknown>;
}

interface SpanFixture {
  id: string;
  name: string;
  input: string;
  startTime: string;
  traceId: string;
  output?: string;
}
// Mock the opperai module
const mockCall = vi.fn();
const mockSpansCreate = vi.fn();
const mockSpansUpdate = vi.fn();

vi.mock("opperai", () => {
  return {
    Opper: vi.fn().mockImplementation(() => ({
      call: mockCall,
      spans: {
        create: mockSpansCreate,
        update: mockSpansUpdate,
      },
    })),
  };
});

describe("Opper Integration - Fixture-Based Tests", () => {
  let client: OpperClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCall.mockClear();
    mockSpansCreate.mockClear();
    mockSpansUpdate.mockClear();

    client = new OpperClient(undefined, { logger: new SilentLogger() });
  });

  describe("Basic call response parsing", () => {
    it("correctly parses real basic call response", async () => {
      const fixture = loadFixture<CallFixture>("call-basic");
      mockCall.mockResolvedValue(fixture);

      const response = await client.call({
        name: "basic_question",
        instructions: "Answer the question",
        input: "What is the capital of France?",
      });

      // Verify structure
      expect(response.spanId).toBe("116f3bb3-4534-442a-a8ef-04ce87eadd44");
      expect(response.message).toBe("Paris");

      // Verify usage parsing
      expect(response.usage).toEqual({
        inputTokens: 32,
        outputTokens: 2,
        totalTokens: 34,
        cost: {
          generation: 0.00010999999999999999,
          platform: 0.000010999999999999998,
          total: 0.00012099999999999999,
        },
      });
    });
  });

  describe("Structured call response parsing", () => {
    it("correctly parses real structured call with jsonPayload", async () => {
      const fixture = loadFixture<CallFixture>("call-structured");
      mockCall.mockResolvedValue(fixture);

      const outputSchema = z.object({
        thoughts: z.string(),
        beds: z.number(),
        seaview: z.boolean(),
        description: z.string(),
      });

      const response = await client.call({
        name: "extract_room_details",
        instructions: "Extract room details",
        input: {
          text: "Suite at Grand Hotel...",
        },
        outputSchema,
      });

      // Verify jsonPayload
      expect(response.jsonPayload).toBeDefined();
      expect(response.jsonPayload?.beds).toBe(3);
      expect(response.jsonPayload?.seaview).toBe(true);
      expect(response.jsonPayload?.thoughts).toContain("identified");

      // Verify usage with detailed tokens
      expect(response.usage.inputTokens).toBe(378);
      expect(response.usage.outputTokens).toBe(134);
      expect(response.usage.totalTokens).toBe(512);
    });
  });

  describe("Call with parent span", () => {
    it("correctly parses call response with parent span context", async () => {
      const fixture = loadFixture<CallFixture>("call-with-parent-span");
      mockCall.mockResolvedValue(fixture);

      const response = await client.call({
        name: "translate_text",
        instructions: "Translate",
        input: { text: "test", target_language: "Swedish" },
        parentSpanId: "parent-span-id",
      });

      expect(response.spanId).toBe("a8edd582-e82c-4354-9864-26e97fa15d14");
      const payload = response.jsonPayload as
        | { translated_text?: string }
        | undefined;
      expect(payload).toBeDefined();
      expect(payload?.translated_text).toBeDefined();
      expect(typeof payload?.translated_text).toBe("string");

      // Verify usage
      expect(response.usage.inputTokens).toBeGreaterThan(0);
      expect(response.usage.outputTokens).toBeGreaterThan(0);
      expect(response.usage.totalTokens).toBeGreaterThan(0);
    });
  });

  describe("Call with minimal/no usage", () => {
    it("handles responses with minimal usage data", async () => {
      const fixture = loadFixture<CallFixture>("call-no-usage");
      mockCall.mockResolvedValue(fixture);

      const response = await client.call({
        name: "simple_greeting",
        instructions: "Say hello",
        input: {},
      });

      expect(response.spanId).toBeDefined();
      expect(response.message).toBeDefined();

      // Usage should still be present (from fixture or defaults)
      expect(response.usage).toBeDefined();
      expect(response.usage.inputTokens).toBeGreaterThanOrEqual(0);
      expect(response.usage.outputTokens).toBeGreaterThanOrEqual(0);
      expect(response.usage.totalTokens).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Span creation", () => {
    it("correctly parses real span creation response", async () => {
      const fixture = loadFixture<SpanFixture>("span-create");
      mockSpansCreate.mockResolvedValue(fixture);

      const span = await client.createSpan({
        name: "translation_workflow",
        input: {
          article: "The rise of artificial intelligence...",
          languages: ["Swedish", "Danish", "Norwegian"],
        },
      });

      expect(span.id).toBe("631145d4-47ed-4e35-8f28-84e1b7f0cd87");
      expect(span.name).toBe("translation_workflow");
      expect(span.input).toBeDefined();
      // Note: Real Opper API returns input as JSON string or object
      if (typeof span.input === "string") {
        const parsedInput = JSON.parse(span.input as string);
        expect(parsedInput).toHaveProperty("article");
        expect(parsedInput).toHaveProperty("languages");
      } else {
        expect(span.input).toHaveProperty("article");
        expect(span.input).toHaveProperty("languages");
      }
    });
  });

  describe("Span update", () => {
    it("correctly handles span update response", async () => {
      const fixture = loadFixture<SpanFixture>("span-update");
      mockSpansUpdate.mockResolvedValue(fixture);

      await expect(
        client.updateSpan("631145d4-47ed-4e35-8f28-84e1b7f0cd87", {
          translations: ["Swedish", "Danish", "Norwegian"],
          status: "completed",
        }),
      ).resolves.not.toThrow();

      expect(mockSpansUpdate).toHaveBeenCalledWith(
        "631145d4-47ed-4e35-8f28-84e1b7f0cd87",
        expect.objectContaining({
          output: expect.anything(),
        }),
      );
    });
  });

  describe("Real response structure validation", () => {
    it("basic call fixture has expected structure", () => {
      const fixture = loadFixture<CallFixture>("call-basic");

      expect(fixture).toHaveProperty("spanId");
      expect(fixture).toHaveProperty("message");
      expect(fixture).toHaveProperty("cached");
      expect(fixture).toHaveProperty("usage");
      expect(fixture).toHaveProperty("cost");

      // Verify usage structure
      const usage = fixture.usage;
      expect(usage).toHaveProperty("output_tokens");
      expect(usage).toHaveProperty("input_tokens");
      expect(usage).toHaveProperty("total_tokens");
      expect(usage).toHaveProperty("output_tokens_details");
      expect(usage).toHaveProperty("input_tokens_details");
    });

    it("structured call fixture has expected jsonPayload", () => {
      const fixture = loadFixture<CallFixture>("call-structured");

      expect(fixture).toHaveProperty("spanId");
      expect(fixture).toHaveProperty("jsonPayload");
      expect(fixture).toHaveProperty("cached");
      expect(fixture).toHaveProperty("usage");

      const jsonPayload = fixture.jsonPayload;
      expect(jsonPayload).toHaveProperty("thoughts");
      expect(jsonPayload).toHaveProperty("beds");
      expect(jsonPayload).toHaveProperty("seaview");
      expect(jsonPayload).toHaveProperty("description");
    });

    it("span create fixture has expected structure", () => {
      const fixture = loadFixture<SpanFixture>("span-create");

      expect(fixture).toHaveProperty("id");
      expect(fixture).toHaveProperty("name");
      expect(fixture).toHaveProperty("input");
      expect(fixture).toHaveProperty("startTime");
      expect(fixture).toHaveProperty("traceId");
    });
  });

  describe("Edge cases from real responses", () => {
    it("handles cached responses correctly", () => {
      const fixture = loadFixture<CallFixture>("call-basic");
      expect(fixture.cached).toBe(false);

      // If we had a cached response fixture, we'd verify that too
      // For now, just verify the field exists
    });

    it("handles detailed usage information", () => {
      const fixture = loadFixture<CallFixture>("call-structured");

      expect(fixture.usage.output_tokens_details).toBeDefined();
      expect(fixture.usage.input_tokens_details).toBeDefined();

      // Verify detailed breakdown exists
      expect(fixture.usage.output_tokens_details).toHaveProperty(
        "reasoning_tokens",
      );
      expect(fixture.usage.input_tokens_details).toHaveProperty(
        "cached_tokens",
      );
    });

    it("handles cost information in responses", () => {
      const fixture = loadFixture<CallFixture>("call-basic");

      expect(fixture.cost).toBeDefined();
      expect(fixture.cost).toHaveProperty("generation");
      expect(fixture.cost).toHaveProperty("platform");
      expect(fixture.cost).toHaveProperty("total");
    });
  });
});
