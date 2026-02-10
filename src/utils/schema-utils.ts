import * as zod from "zod";
import type { ZodIssue, ZodType, ZodTypeAny } from "zod";
import type { JsonSchema7Type } from "zod-to-json-schema";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Check if Zod 4's native toJSONSchema is available.
 * Zod 4 exports toJSONSchema directly, while zod-to-json-schema doesn't work with Zod 4.
 */
const hasNativeToJSONSchema = typeof (zod as { toJSONSchema?: unknown }).toJSONSchema === "function";

/**
 * Convert a Zod schema to JSON Schema, compatible with both Zod 3 and Zod 4.
 * Uses native toJSONSchema for Zod 4, falls back to zod-to-json-schema for Zod 3.
 * Note: Zod 4's toJSONSchema has a bug with single-arg z.record(), so we fall back on error.
 */
export function zodSchemaToJsonSchema(
  schema: ZodTypeAny,
): Record<string, unknown> {
  if (hasNativeToJSONSchema) {
    try {
      // Use Zod 4's native toJSONSchema
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toJSONSchema = (zod as any).toJSONSchema;
      const result: Record<string, unknown> = toJSONSchema(schema);
      return result;
    } catch {
      // Zod 4's toJSONSchema has bugs with certain patterns (e.g., single-arg z.record())
      // Fall back to zod-to-json-schema which may produce limited output but won't crash
    }
  }
  // Fall back to zod-to-json-schema for Zod 3 or when Zod 4's native fails
  // @ts-expect-error Type instantiation is excessively deep
  return zodToJsonSchema(schema);
}

export class SchemaValidationError extends Error {
  public readonly issues: ZodIssue[];

  constructor(message: string, issues: ZodIssue[]) {
    super(message);
    this.name = "SchemaValidationError";
    this.issues = issues;
  }
}

export type Schema<T> = ZodType<T>;

export interface SchemaValidationOptions {
  message?: string;
}

export const validateSchema = <T>(
  schema: Schema<T>,
  value: unknown,
  options: SchemaValidationOptions = {},
): T => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new SchemaValidationError(
      options.message ?? "Schema validation failed",
      result.error.issues,
    );
  }

  return result.data;
};

export const isSchemaValid = <T>(
  schema: Schema<T>,
  value: unknown,
): value is T => {
  return schema.safeParse(value).success;
};

export interface JsonSchemaOptions {
  name?: string;
  target?: "jsonSchema7" | "openApi3";
}

export const schemaToJson = (
  schema: ZodTypeAny,
  options: JsonSchemaOptions = {},
): JsonSchema7Type => {
  if (hasNativeToJSONSchema) {
    // Zod 4's native toJSONSchema doesn't support options, but produces valid JSON Schema
    return zodSchemaToJsonSchema(schema) as JsonSchema7Type;
  }
  // @ts-expect-error Zod 3/4 type mismatch with zod-to-json-schema (only reached under Zod 3)
  return zodToJsonSchema(schema, options) as JsonSchema7Type;
};

export const getSchemaDefault = <T>(schema: Schema<T>): T | undefined => {
  const result = schema.safeParse(undefined);
  return result.success ? result.data : undefined;
};

export const mergeSchemaDefaults = <T extends Record<string, unknown>>(
  schema: Schema<T>,
  value: Partial<T>,
): T => {
  const defaults = getSchemaDefault(schema);
  if (defaults && typeof defaults === "object") {
    return validateSchema(schema, { ...defaults, ...value });
  }

  return validateSchema(schema, value);
};
