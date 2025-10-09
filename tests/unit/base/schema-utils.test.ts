import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  SchemaValidationError,
  getSchemaDefault,
  isSchemaValid,
  mergeSchemaDefaults,
  schemaToJson,
  validateSchema,
} from "@/utils/schema-utils";

describe("schema-utils", () => {
  it("validates schema values", () => {
    const schema = z.object({ id: z.string().uuid() });
    const payload = { id: randomUUID() };

    expect(validateSchema(schema, payload)).toEqual(payload);
    expect(isSchemaValid(schema, payload)).toBe(true);
    expect(() => validateSchema(schema, { id: "not-uuid" })).toThrow(
      SchemaValidationError,
    );
  });

  it("merges defaults", () => {
    const schema = z.object({
      mode: z.enum(["auto", "manual"]).default("auto"),
      retries: z.number().int().default(1),
    });

    const merged = mergeSchemaDefaults(schema, { retries: 3 });
    expect(merged.mode).toBe("auto");
    expect(merged.retries).toBe(3);
  });

  it("generates json schema", () => {
    const schema = z.object({ name: z.string() }).describe("Test schema");
    const json = schemaToJson(schema);

    expect(json).toBeDefined();

    if (!json || typeof json !== "object" || !("properties" in json)) {
      throw new Error("Expected properties to be present on generated schema");
    }

    const properties = json.properties as Record<string, unknown>;
    expect(properties).toHaveProperty("name");
  });

  it("gets schema defaults", () => {
    const schema = z.string().default("hello");
    expect(getSchemaDefault(schema)).toBe("hello");
  });
});
