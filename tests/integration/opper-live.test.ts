/**
 * Live integration tests for Opper client
 * These tests make real API calls and are skipped by default
 *
 * To run these tests:
 *   OPPER_API_KEY=your_key pnpm test:integration:live
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { OpperClient } from "@/opper/client";
import { ConsoleLogger, LogLevel } from "@/utils/logger";

// Skip these tests unless explicitly enabled
const isLiveTestEnabled = !!process.env["OPPER_API_KEY"];
const testFn = isLiveTestEnabled ? it : it.skip;

const logLiveMessage = (message: string, payload?: unknown): void => {
  const suffix =
    payload === undefined
      ? ""
      : (() => {
          try {
            return ` ${JSON.stringify(payload)}`;
          } catch {
            return " [unserializable payload]";
          }
        })();

  process.stdout.write(`${message}${suffix}\n`);
};

describe.skip("Opper Integration - Live API Tests", () => {
  const client = isLiveTestEnabled
    ? new OpperClient(process.env["OPPER_API_KEY"], {
        logger: new ConsoleLogger(LogLevel.WARN),
      })
    : ({} as OpperClient);

  testFn(
    "makes a real basic call",
    async () => {
      const response = await client.call({
        name: "live_test_basic",
        instructions: "Answer with just the city name, no extra words",
        input: "What is the capital of France?",
      });

      expect(response.spanId).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.usage.totalTokens).toBeGreaterThan(0);

      logLiveMessage("✓ Live basic call:", {
        spanId: response.spanId,
        message: response.message,
        usage: response.usage,
      });
    },
    15000,
  );

  testFn(
    "makes a real structured call with schemas",
    async () => {
      const outputSchema = z.object({
        capital: z.string().describe("The capital city"),
        country: z.string().describe("The country name"),
        continent: z.string().describe("The continent"),
      });

      const response = await client.call({
        name: "live_test_structured",
        instructions: "Extract geographical information",
        input: {
          question: "What is the capital of Japan?",
        },
        outputSchema,
      });

      expect(response.spanId).toBeDefined();
      expect(response.jsonPayload).toBeDefined();
      expect(response.jsonPayload?.capital).toBe("Tokyo");
      expect(response.jsonPayload?.country).toBe("Japan");
      expect(response.jsonPayload?.continent).toBeDefined();

      logLiveMessage("✓ Live structured call:", {
        spanId: response.spanId,
        payload: response.jsonPayload,
        usage: response.usage,
      });
    },
    15000,
  );

  testFn(
    "creates and updates a real span",
    async () => {
      const span = await client.createSpan({
        name: "live_test_workflow",
        input: { test: "data", timestamp: Date.now() },
      });

      expect(span.id).toBeDefined();
      expect(span.name).toBe("live_test_workflow");

      logLiveMessage("✓ Live span created:", {
        spanId: span.id,
        name: span.name,
      });

      // Update the span
      await client.updateSpan(
        span.id,
        JSON.stringify({
          result: "success",
          completedAt: new Date().toISOString(),
        }),
      );

      logLiveMessage("✓ Live span updated:", span.id);
    },
    15000,
  );

  testFn(
    "makes call with parent span context",
    async () => {
      // Create parent span
      const parentSpan = await client.createSpan({
        name: "live_test_parent",
        input: { workflow: "multi-step" },
      });

      // Make call with parent context
      const response = await client.call({
        name: "live_test_child",
        instructions: "Say hello",
        input: {},
        parentSpanId: parentSpan.id,
      });

      expect(response.spanId).toBeDefined();
      expect(response.spanId).not.toBe(parentSpan.id);

      logLiveMessage("✓ Live call with parent span:", {
        parentSpanId: parentSpan.id,
        childSpanId: response.spanId,
      });

      // Update parent span with final result
      await client.updateSpan(
        parentSpan.id,
        JSON.stringify({
          status: "completed",
          childSpans: [response.spanId],
        }),
      );
    },
    15000,
  );

  testFn(
    "handles retry on transient failures",
    async () => {
      // Create client with aggressive retry config for testing
      const retryClient = new OpperClient(process.env["OPPER_API_KEY"], {
        logger: new ConsoleLogger(LogLevel.WARN),
        retryConfig: {
          maxRetries: 2,
          initialDelayMs: 100,
          backoffMultiplier: 2,
          maxDelayMs: 500,
        },
      });

      // Make a normal call (should succeed without retries)
      const response = await retryClient.call({
        name: "live_test_retry",
        instructions: "Count to 3",
        input: {},
      });

      expect(response.spanId).toBeDefined();

      logLiveMessage("✓ Live retry test (no actual retry needed):", {
        spanId: response.spanId,
      });
    },
    15000,
  );
});

// Show skip message
if (!isLiveTestEnabled) {
  process.stdout.write(
    "\n⚠️  Live integration tests skipped. Set OPPER_API_KEY environment variable to run them.\n",
  );
}
