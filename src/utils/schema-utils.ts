import type { ZodIssue, ZodType, ZodTypeAny } from "zod";
import type { JsonSchema7Type } from "zod-to-json-schema";
import { zodToJsonSchema } from "zod-to-json-schema";

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
