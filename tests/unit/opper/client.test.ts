import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";

import {
  OpperClient,
  createOpperClient,
  DEFAULT_RETRY_CONFIG,
} from "@/opper/client";
import { SilentLogger, LogLevel, ConsoleLogger } from "@/utils/logger";

// Create mock functions at module level
const mockCall = vi.fn();
const mockSpansCreate = vi.fn();
const mockSpansUpdate = vi.fn();

// Mock the opperai module
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

describe("OpperClient", () => {
  let client: OpperClient;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    mockCall.mockClear();
    mockSpansCreate.mockClear();
    mockSpansUpdate.mockClear();

    // Create client with silent logger for tests
    client = new OpperClient(undefined, { logger: new SilentLogger() });
  });

  describe("Constructor", () => {
    it("creates client with default configuration", () => {
      const testClient = new OpperClient();
      expect(testClient).toBeInstanceOf(OpperClient);
    });

    it("creates client with custom API key", () => {
      const testClient = new OpperClient("test-api-key");
      expect(testClient).toBeInstanceOf(OpperClient);
    });

    it("creates client with custom logger", () => {
      const logger = new SilentLogger();
      const testClient = new OpperClient(undefined, { logger });
      expect(testClient).toBeInstanceOf(OpperClient);
    });

    it("creates client with custom retry config", () => {
      const testClient = new OpperClient(undefined, {
        retryConfig: { maxRetries: 5, initialDelayMs: 500 },
      });
      expect(testClient).toBeInstanceOf(OpperClient);
    });
  });

  describe("call", () => {
    it("makes successful call with basic options", async () => {
      mockCall.mockResolvedValue({
        message: "Hello, world!",
        spanId: "span-123",
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      const response = await client.call({
        name: "test-call",
        instructions: "Say hello",
        input: { name: "World" },
      });

      expect(response).toEqual({
        message: "Hello, world!",
        spanId: "span-123",
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
          cost: {
            generation: 0,
            platform: 0,
            total: 0,
          },
        },
      });
      expect(mockCall).toHaveBeenCalledWith({
        name: "test-call",
        instructions: "Say hello",
        input: { name: "World" },
      });
    });

    it("makes call with JSON payload response", async () => {
      const jsonPayload = { greeting: "Hello", recipient: "World" };
      mockCall.mockResolvedValue({
        jsonPayload,
        spanId: "span-456",
        usage: { input_tokens: 15, output_tokens: 25 },
      });

      const response = await client.call({
        name: "structured-call",
        instructions: "Generate greeting",
        input: { name: "World" },
        outputSchema: z.object({
          greeting: z.string(),
          recipient: z.string(),
        }),
      });

      expect(response.jsonPayload).toEqual(jsonPayload);
      expect(response.spanId).toBe("span-456");
    });

    it("converts Zod schemas to JSON Schema", async () => {
      const inputSchema = z.object({ name: z.string() });
      const outputSchema = z.object({ message: z.string() });

      mockCall.mockResolvedValue({
        message: "test",
        spanId: "span-789",
        usage: { input_tokens: 5, output_tokens: 10 },
      });

      await client.call({
        name: "schema-call",
        instructions: "Test schemas",
        input: { name: "Test" },
        inputSchema,
        outputSchema,
      });

      expect(mockCall).toHaveBeenCalled();
      const callArgs = mockCall.mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      if (!callArgs) {
        throw new Error("Expected call arguments to be recorded");
      }
      expect(callArgs.inputSchema).toBeDefined();
      expect(callArgs.outputSchema).toBeDefined();
      // Zod schemas should be converted to JSON Schema objects
      expect(callArgs.inputSchema).toHaveProperty("type");
      expect(callArgs.outputSchema).toHaveProperty("type");
    });

    it("passes through JSON Schema objects unchanged", async () => {
      const inputSchema = {
        type: "object",
        properties: { name: { type: "string" } },
      };
      const outputSchema = {
        type: "object",
        properties: { message: { type: "string" } },
      };

      mockCall.mockResolvedValue({
        message: "test",
        spanId: "span-abc",
        usage: { input_tokens: 5, output_tokens: 10 },
      });

      await client.call({
        name: "json-schema-call",
        instructions: "Test JSON Schema",
        input: { name: "Test" },
        inputSchema,
        outputSchema,
      });

      expect(mockCall).toHaveBeenCalled();
      const callArgs = mockCall.mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      if (!callArgs) {
        throw new Error("Expected call arguments to be recorded");
      }
      expect(callArgs.inputSchema).toEqual(inputSchema);
      expect(callArgs.outputSchema).toEqual(outputSchema);
    });

    it("includes optional parameters when provided", async () => {
      mockCall.mockResolvedValue({
        message: "test",
        spanId: "span-def",
        usage: { input_tokens: 5, output_tokens: 10 },
      });

      await client.call({
        name: "full-options-call",
        instructions: "Test all options",
        input: { test: true },
        model: "anthropic/claude-3.7-sonnet",
        parentSpanId: "parent-span-123",
      });

      expect(mockCall).toHaveBeenCalled();
      const callArgs = mockCall.mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      if (!callArgs) {
        throw new Error("Expected call arguments to be recorded");
      }
      expect(callArgs.model).toBe("anthropic/claude-3.7-sonnet");
      expect(callArgs.parentSpanId).toBe("parent-span-123");
    });

    it("forwards an array of models for fallback", async () => {
      mockCall.mockResolvedValue({
        message: "ok",
        spanId: "span-fallback",
        usage: { input_tokens: 1, output_tokens: 1 },
      });

      const models = [
        "openai/gpt-4o-mini",
        "anthropic/claude-3.7-sonnet",
      ] as const;

      await client.call({
        name: "fallback-models",
        instructions: "test",
        input: {},
        model: models,
      });

      expect(mockCall).toHaveBeenCalled();
      const callArgs = mockCall.mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      if (!callArgs) throw new Error("Expected call arguments");
      expect(callArgs.model).toEqual(models);
    });

    it("handles missing usage information gracefully", async () => {
      mockCall.mockResolvedValue({
        message: "test",
        spanId: "span-ghi",
        // No usage field
      });

      const response = await client.call({
        name: "no-usage-call",
        instructions: "Test missing usage",
        input: {},
      });

      expect(response.usage).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cost: {
          generation: 0,
          platform: 0,
          total: 0,
        },
      });
    });
  });

  describe("createSpan", () => {
    it("creates span with name and input", async () => {
      mockSpansCreate.mockResolvedValue({
        id: "new-span-123",
        name: "test-span",
      });

      const span = await client.createSpan({
        name: "test-span",
        input: { test: "data" },
      });

      expect(span).toEqual({
        id: "new-span-123",
        name: "test-span",
        input: { test: "data" },
      });
      expect(mockSpansCreate).toHaveBeenCalledWith({
        name: "test-span",
        input: { test: "data" },
      });
    });

    it("creates span without input", async () => {
      mockSpansCreate.mockResolvedValue({
        id: "new-span-456",
        name: "minimal-span",
      });

      const span = await client.createSpan({
        name: "minimal-span",
      });

      expect(span.id).toBe("new-span-456");
      expect(mockSpansCreate).toHaveBeenCalledWith({
        name: "minimal-span",
      });
    });
  });

  describe("updateSpan", () => {
    it("updates span with output", async () => {
      mockSpansUpdate.mockResolvedValue({});

      await client.updateSpan("span-123", { result: "success" });

      // Objects are serialized to JSON strings
      expect(mockSpansUpdate).toHaveBeenCalledWith("span-123", {
        output: JSON.stringify({ result: "success" }),
      });
    });

    it("updates span with null output", async () => {
      mockSpansUpdate.mockResolvedValue({});

      await client.updateSpan("span-456", null);

      // null is omitted (not sent)
      expect(mockSpansUpdate).toHaveBeenCalledWith("span-456", {});
    });
  });

  describe("getClient", () => {
    it("returns underlying Opper client", () => {
      const underlyingClient = client.getClient();
      expect(underlyingClient).toBeDefined();
      expect(underlyingClient.call).toBe(mockCall);
      expect(underlyingClient.spans.create).toBe(mockSpansCreate);
      expect(underlyingClient.spans.update).toBe(mockSpansUpdate);
    });
  });

  describe("Retry logic", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("retries on network errors", async () => {
      let callCount = 0;
      mockCall.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          throw new Error("Network error");
        }
        return Promise.resolve({
          message: "success",
          spanId: "span-retry",
          usage: { input_tokens: 5, output_tokens: 10 },
        });
      });

      const promise = client.call({
        name: "retry-call",
        instructions: "Test retry",
        input: {},
      });

      // Fast-forward through retry delays
      await vi.runAllTimersAsync();

      const response = await promise;
      expect(response.message).toBe("success");
      expect(callCount).toBe(3);
    });

    it("does not retry on non-retryable errors", async () => {
      mockCall.mockRejectedValue(new Error("Invalid input schema"));

      await expect(
        client.call({
          name: "non-retryable-call",
          instructions: "Test non-retryable",
          input: {},
        }),
      ).rejects.toThrow("Invalid input schema");

      expect(mockCall).toHaveBeenCalledTimes(1);
    });

    it("uses exponential backoff", async () => {
      const testClient = new OpperClient(undefined, {
        logger: new SilentLogger(),
        retryConfig: {
          maxRetries: 3,
          initialDelayMs: 100,
          backoffMultiplier: 2,
          maxDelayMs: 1000,
        },
      });

      let callCount = 0;
      mockCall.mockImplementation(() => {
        callCount++;
        if (callCount < 4) {
          throw new Error("Rate limit exceeded");
        }
        return Promise.resolve({
          message: "success",
          spanId: "span-backoff",
          usage: { input_tokens: 5, output_tokens: 10 },
        });
      });

      const promise = testClient.call({
        name: "backoff-call",
        instructions: "Test backoff",
        input: {},
      });

      await vi.runAllTimersAsync();
      await promise;

      expect(callCount).toBe(4);
    });

    it("respects max delay limit", async () => {
      const testClient = new OpperClient(undefined, {
        logger: new SilentLogger(),
        retryConfig: {
          maxRetries: 5,
          initialDelayMs: 1000,
          backoffMultiplier: 10,
          maxDelayMs: 2000,
        },
      });

      let callCount = 0;
      mockCall.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          throw new Error("Timeout error");
        }
        return Promise.resolve({
          message: "success",
          spanId: "span-maxdelay",
          usage: { input_tokens: 5, output_tokens: 10 },
        });
      });

      const promise = testClient.call({
        name: "maxdelay-call",
        instructions: "Test max delay",
        input: {},
      });

      await vi.runAllTimersAsync();
      await promise;

      expect(callCount).toBe(3);
    });

    it("fails after max retries", async () => {
      const testClient = new OpperClient(undefined, {
        logger: new SilentLogger(),
        retryConfig: {
          maxRetries: 2,
          initialDelayMs: 10,
          backoffMultiplier: 2,
          maxDelayMs: 100,
        },
      });

      mockCall.mockRejectedValue(new Error("Network timeout"));

      const promise = testClient
        .call({
          name: "max-retries-call",
          instructions: "Test max retries",
          input: {},
        })
        .catch((error) => error);

      await vi.runAllTimersAsync();

      const result = await promise;
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("Network timeout");
      expect(mockCall).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it("logs retry attempts", async () => {
      const logger = new ConsoleLogger(LogLevel.WARN);
      const warnSpy = vi.spyOn(logger, "warn");

      const testClient = new OpperClient(undefined, {
        logger,
        retryConfig: {
          maxRetries: 2,
          initialDelayMs: 10,
          backoffMultiplier: 2,
          maxDelayMs: 100,
        },
      });

      let callCount = 0;
      mockCall.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          throw new Error("Rate limit 429");
        }
        return Promise.resolve({
          message: "success",
          spanId: "span-log",
          usage: { input_tokens: 5, output_tokens: 10 },
        });
      });

      const promise = testClient.call({
        name: "log-retry-call",
        instructions: "Test logging",
        input: {},
      });

      await vi.runAllTimersAsync();
      await promise;

      expect(warnSpy).toHaveBeenCalledTimes(2); // 2 retry warnings
      warnSpy.mockRestore();
    });
  });

  describe("createOpperClient factory", () => {
    it("creates OpperClient instance", () => {
      const factoryClient = createOpperClient();
      expect(factoryClient).toBeInstanceOf(OpperClient);
    });

    it("passes configuration to OpperClient", () => {
      const logger = new SilentLogger();
      const factoryClient = createOpperClient("test-key", {
        logger,
        retryConfig: { maxRetries: 5 },
      });
      expect(factoryClient).toBeInstanceOf(OpperClient);
    });
  });

  describe("DEFAULT_RETRY_CONFIG", () => {
    it("has expected default values", () => {
      expect(DEFAULT_RETRY_CONFIG).toEqual({
        maxRetries: 3,
        initialDelayMs: 1000,
        backoffMultiplier: 2,
        maxDelayMs: 10000,
      });
    });
  });
});
