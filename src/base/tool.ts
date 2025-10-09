import { randomUUID } from "node:crypto";
import type { ZodType, ZodTypeAny } from "zod";
import { z } from "zod";

import type { BaseAgent } from "./agent";
import type { AgentContext } from "./context";
import { err, ok, type Result } from "./result";

export const ToolMetadataSchema = z.record(z.string(), z.unknown());

export const ToolCallRecordSchema = z.object({
  id: z
    .string()
    .optional()
    .default(() => randomUUID()),
  toolName: z.string(),
  input: z.unknown(),
  output: z.unknown().optional(),
  success: z.boolean().optional(),
  error: z
    .union([z.string(), z.object({ message: z.string() }).passthrough()])
    .optional(),
  startedAt: z.number().default(() => Date.now()),
  finishedAt: z.number().optional(),
  metadata: ToolMetadataSchema.default({}),
});

export type ToolCallRecord = z.infer<typeof ToolCallRecordSchema>;

const toolResultBaseSchema = z.object({
  toolName: z.string(),
  metadata: ToolMetadataSchema.default({}),
  startedAt: z.number().optional(),
  finishedAt: z.number().optional(),
});

export const ToolResultSuccessSchema = toolResultBaseSchema
  .extend({
    success: z.literal(true),
    output: z.any(),
  })
  .refine((data) => data.output !== undefined, {
    message: "output is required",
  });

export const ToolResultFailureSchema = toolResultBaseSchema.extend({
  success: z.literal(false),
  error: z.union([z.string(), z.instanceof(Error)]),
});

export const ToolResultSchema = z.union([
  ToolResultSuccessSchema,
  ToolResultFailureSchema,
]);

export type ToolResultData = z.infer<typeof ToolResultSchema>;

export interface ToolExecutionContext {
  agentContext: AgentContext;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
  /**
   * Span ID for this tool execution (used as parent for nested operations)
   */
  spanId?: string;
}

export interface ToolSuccess<TOutput> {
  success: true;
  toolName: string;
  output: TOutput;
  metadata: Record<string, unknown>;
  startedAt?: number;
  finishedAt?: number;
}

export interface ToolFailure {
  success: false;
  toolName: string;
  error: Error | string;
  metadata: Record<string, unknown>;
  startedAt?: number;
  finishedAt?: number;
}

export type ToolResult<TOutput = unknown> = ToolSuccess<TOutput> | ToolFailure;

export interface ToolDefinition<TInput, TOutput> {
  name: string;
  description?: string;
  schema?: ZodType<TInput>;
  execute: (
    input: TInput,
    context: ToolExecutionContext,
  ) => MaybePromise<ToolResult<TOutput>>;
  metadata?: Record<string, unknown>;
  timeoutMs?: number;
}

export type MaybePromise<T> = T | Promise<T>;

export type Tool<TInput, TOutput> = ToolDefinition<TInput, TOutput>;

export interface ToolProvider {
  setup(
    agent: BaseAgent<unknown, unknown>,
  ): Promise<Array<Tool<unknown, unknown>>>;
  teardown(): Promise<void>;
}

export interface ToolResultInit {
  metadata?: Record<string, unknown>;
  startedAt?: number;
  finishedAt?: number;
}

export const ToolResultFactory = {
  success<TOutput>(
    toolName: string,
    output: TOutput,
    init: ToolResultInit = {},
  ): ToolSuccess<TOutput> {
    const result: ToolSuccess<TOutput> = {
      success: true,
      toolName,
      output,
      ...(init.startedAt !== undefined && { startedAt: init.startedAt }),
      finishedAt: init.finishedAt ?? Date.now(),
      metadata: init.metadata ?? {},
    };

    // Validate with schema
    ToolResultSuccessSchema.parse(result);

    return result;
  },

  failure(
    toolName: string,
    error: Error | string,
    init: ToolResultInit = {},
  ): ToolFailure {
    const result: ToolFailure = {
      success: false,
      toolName,
      error,
      ...(init.startedAt !== undefined && { startedAt: init.startedAt }),
      finishedAt: init.finishedAt ?? Date.now(),
      metadata: init.metadata ?? {},
    };

    // Validate with schema
    ToolResultFailureSchema.parse(result);

    return result;
  },

  isSuccess<TOutput>(
    result: ToolResult<TOutput>,
  ): result is ToolSuccess<TOutput> {
    return result.success;
  },

  isFailure<TOutput>(result: ToolResult<TOutput>): result is ToolFailure {
    return !result.success;
  },
};

export const createToolCallRecord = (
  input: Partial<ToolCallRecord>,
): ToolCallRecord => ToolCallRecordSchema.parse(input);

export const validateToolInput = <TSchema extends ZodTypeAny>(
  schema: TSchema,
  payload: unknown,
): Result<z.infer<TSchema>, z.ZodError<z.infer<TSchema>>> => {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return err(parsed.error);
  }

  return ok(parsed.data);
};

export const coerceToolDefinition = <TInput, TOutput>(
  definition: ToolDefinition<TInput, TOutput>,
): Tool<TInput, TOutput> => {
  if (!definition.name || definition.name.trim().length === 0) {
    throw new Error("Tool definition requires a non-empty name");
  }

  if (!definition.metadata) {
    definition.metadata = {};
  }

  return definition;
};

export const isToolProvider = (value: unknown): value is ToolProvider => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ToolProvider>;
  return (
    typeof candidate.setup === "function" &&
    typeof candidate.teardown === "function"
  );
};

export const normalizeToolEntries = (
  entries: Array<Tool<unknown, unknown> | ToolProvider>,
): {
  tools: Array<Tool<unknown, unknown>>;
  providers: Array<ToolProvider>;
} => {
  const tools: Array<Tool<unknown, unknown>> = [];
  const providers: Array<ToolProvider> = [];

  for (const entry of entries) {
    if (isToolProvider(entry)) {
      providers.push(entry);
    } else {
      tools.push(entry);
    }
  }

  return { tools, providers };
};
