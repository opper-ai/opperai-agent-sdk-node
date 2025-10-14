import { Opper } from "opperai";
import type { z } from "zod";
import type { ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { AgentLogger } from "../utils/logger";
import { getDefaultLogger } from "../utils/logger";
import { getUserAgent } from "../utils/version";

type OpperCallResult = Awaited<ReturnType<Opper["call"]>>;

type TokenUsageMetrics = {
  inputTokens: number;
  outputTokens: number;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isZodSchema = (value: unknown): value is ZodTypeAny =>
  typeof value === "object" &&
  value !== null &&
  "_def" in (value as Record<string, unknown>) &&
  typeof (value as { parse?: unknown }).parse === "function";

const readTokenCount = (
  usage: Record<string, unknown> | undefined,
  key: string,
): number => {
  if (!usage) {
    return 0;
  }

  const value = usage[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

const extractUsage = (response: OpperCallResult): TokenUsageMetrics => {
  const usageRecord = isPlainRecord(response.usage)
    ? response.usage
    : undefined;

  return {
    inputTokens: readTokenCount(usageRecord, "input_tokens"),
    outputTokens: readTokenCount(usageRecord, "output_tokens"),
  };
};

const extractCost = (
  response: OpperCallResult,
): { generation: number; platform: number; total: number } => {
  const costRecord = isPlainRecord(response.cost) ? response.cost : undefined;

  return {
    generation: readTokenCount(costRecord, "generation"),
    platform: readTokenCount(costRecord, "platform"),
    total: readTokenCount(costRecord, "total"),
  };
};

/**
 * Opper call response
 */
export interface OpperCallResponse<TOutput = unknown> {
  /**
   * Parsed JSON output (if outputSchema provided)
   */
  jsonPayload?: TOutput;

  /**
   * Text message response
   */
  message?: string | null | undefined;

  /**
   * Span ID for this call
   */
  spanId: string;

  /**
   * Token usage information
   */
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: {
      generation: number;
      platform: number;
      total: number;
    };
  };
}

/**
 * Options for Opper call
 */
export interface OpperCallOptions<TInput = unknown, TOutput = unknown> {
  /**
   * Unique name for this call/task
   */
  name: string;

  /**
   * Natural language instructions
   */
  instructions: string;

  /**
   * Input data for the call
   */
  input: TInput;

  /**
   * Input schema (Zod or JSON Schema)
   */
  inputSchema?: z.ZodType<TInput> | Record<string, unknown>;

  /**
   * Output schema (Zod or JSON Schema)
   */
  outputSchema?: z.ZodType<TOutput> | Record<string, unknown>;

  /**
   * Model to use. Accepts a single model identifier or an ordered list for fallback.
   * Example: "anthropic/claude-3.7-sonnet" or ["openai/gpt-4o", "anthropic/claude-3.7-sonnet"].
   */
  model?: string | readonly string[];

  /**
   * Parent span ID for tracing
   */
  parentSpanId?: string;
}

/**
 * Span information
 */
export interface OpperSpan {
  id: string;
  name: string;
  input?: unknown;
  output?: unknown;
}

/**
 * Options for creating a span
 */
export interface CreateSpanOptions {
  name: string;
  input?: unknown;
  parentSpanId?: string;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts
   */
  maxRetries: number;

  /**
   * Initial delay in milliseconds
   */
  initialDelayMs: number;

  /**
   * Backoff multiplier
   */
  backoffMultiplier: number;

  /**
   * Maximum delay in milliseconds
   */
  maxDelayMs: number;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 10000,
};

/**
 * Opper client wrapper with retry logic and usage tracking
 */
export class OpperClient {
  private readonly client: Opper;
  private readonly logger: AgentLogger;
  private readonly retryConfig: RetryConfig;

  constructor(
    apiKey?: string,
    options: {
      logger?: AgentLogger;
      retryConfig?: Partial<RetryConfig>;
    } = {},
  ) {
    this.client = new Opper({
      httpBearer: apiKey ?? process.env["OPPER_HTTP_BEARER"] ?? "",
      userAgent: getUserAgent(),
    });
    this.logger = options.logger ?? getDefaultLogger();
    this.retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...(options.retryConfig ?? {}),
    };
  }

  /**
   * Make a call to Opper with retry logic
   */
  public async call<TInput = unknown, TOutput = unknown>(
    options: OpperCallOptions<TInput, TOutput>,
  ): Promise<OpperCallResponse<TOutput>> {
    return this.withRetry(async () => {
      // Convert Zod schemas to JSON Schema if needed
      const inputSchema = this.toJsonSchema(options.inputSchema);
      const outputSchema = this.toJsonSchema(options.outputSchema);

      const response = await this.client.call({
        name: options.name,
        instructions: options.instructions,
        input: options.input,
        ...(inputSchema && { inputSchema }),
        ...(outputSchema && { outputSchema }),
        ...(options.model && { model: options.model }),
        ...(options.parentSpanId && { parentSpanId: options.parentSpanId }),
      });

      // Parse usage information
      const usagePayload = extractUsage(response);
      const costPayload = extractCost(response);
      const usage = {
        inputTokens: usagePayload.inputTokens,
        outputTokens: usagePayload.outputTokens,
        totalTokens: usagePayload.inputTokens + usagePayload.outputTokens,
        cost: costPayload,
      };

      const result: OpperCallResponse<TOutput> = {
        ...(response.jsonPayload !== undefined && response.jsonPayload !== null
          ? { jsonPayload: response.jsonPayload as TOutput }
          : {}),
        ...(response.message !== undefined && response.message !== null
          ? { message: response.message }
          : {}),
        spanId: response.spanId,
        usage,
      };

      return result;
    }, options.name);
  }

  /**
   * Create a span for tracing
   */
  public async createSpan(options: CreateSpanOptions): Promise<OpperSpan> {
    return this.withRetry(async () => {
      const span = await this.client.spans.create({
        name: options.name,
        ...(options.input !== undefined && { input: options.input }),
        ...(options.parentSpanId && { parentId: options.parentSpanId }),
      });

      return {
        id: span.id,
        name: options.name,
        input: options.input,
      };
    }, `create-span:${options.name}`);
  }

  /**
   * Update a span with output or error
   */
  public async updateSpan(
    spanId: string,
    output: unknown,
    options?: { error?: string },
  ): Promise<void> {
    return this.withRetry(async () => {
      // Serialize output to string if it's an object
      const serializedOutput =
        output !== undefined && output !== null
          ? typeof output === "object"
            ? JSON.stringify(output)
            : String(output)
          : undefined;

      await this.client.spans.update(spanId, {
        ...(serializedOutput !== undefined && { output: serializedOutput }),
        ...(options?.error && { error: options.error }),
      });
    }, `update-span:${spanId}`);
  }

  /**
   * Get the underlying Opper client
   */
  public getClient(): Opper {
    return this.client;
  }

  /**
   * Execute a function with retry logic and exponential backoff
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    let lastError: Error | undefined;
    let delay = this.retryConfig.initialDelayMs;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on last attempt
        if (attempt === this.retryConfig.maxRetries) {
          break;
        }

        // Check if error is retryable (network errors, rate limits, etc.)
        if (!this.isRetryableError(error)) {
          throw lastError;
        }

        this.logger.warn(
          `Opper operation "${operationName}" failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1}), retrying in ${delay}ms`,
          {
            error: lastError.message,
            attempt: attempt + 1,
            delayMs: delay,
          },
        );

        // Wait before retrying
        await this.sleep(delay);

        // Exponential backoff
        delay = Math.min(
          delay * this.retryConfig.backoffMultiplier,
          this.retryConfig.maxDelayMs,
        );
      }
    }

    this.logger.error(
      `Opper operation "${operationName}" failed after ${this.retryConfig.maxRetries + 1} attempts`,
      lastError,
    );
    throw lastError;
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    // Check for common retryable errors
    const errorMessage = error.message.toLowerCase();
    const retryablePatterns = [
      "network",
      "timeout",
      "econnreset",
      "enotfound",
      "econnrefused",
      "etimedout",
      "rate limit",
      "429",
      "500",
      "502",
      "503",
      "504",
    ];

    return retryablePatterns.some((pattern) => errorMessage.includes(pattern));
  }

  /**
   * Convert Zod schema to JSON Schema
   */
  private toJsonSchema(
    schema: ZodTypeAny | Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    if (!schema) {
      return undefined;
    }

    if (isZodSchema(schema)) {
      try {
        return zodToJsonSchema(schema) as Record<string, unknown>;
      } catch (error) {
        this.logger.warn("Failed to convert Zod schema to JSON Schema", {
          error: error instanceof Error ? error.message : String(error),
        });
        return undefined;
      }
    }

    if (isPlainRecord(schema)) {
      return schema;
    }

    this.logger.warn("Unsupported schema type provided to OpperClient", {
      schemaType: typeof schema,
    });
    return undefined;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create an Opper client with optional configuration
 */
export function createOpperClient(
  apiKey?: string,
  options?: {
    logger?: AgentLogger;
    retryConfig?: Partial<RetryConfig>;
  },
): OpperClient {
  return new OpperClient(apiKey, options);
}
