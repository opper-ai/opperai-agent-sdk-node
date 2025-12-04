import type { ZodTypeAny } from "zod";

export const STREAM_ROOT_PATH = "_root";

const NUMERIC_TOKEN_PATTERN = /^\d+$/;
const BRACKET_TOKEN_PATTERN = /\[(\d+)\]/g;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const coercePrimitive = (value: string): unknown => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return value;
  }

  const lower = trimmed.toLowerCase();
  if (lower === "true") {
    return true;
  }
  if (lower === "false") {
    return false;
  }
  if (lower === "null") {
    return null;
  }

  if (/^-?\d+$/.test(trimmed)) {
    const intValue = Number.parseInt(trimmed, 10);
    return Number.isNaN(intValue) ? value : intValue;
  }

  if (/^-?\d+\.\d+$/.test(trimmed)) {
    const floatValue = Number.parseFloat(trimmed);
    return Number.isNaN(floatValue) ? value : floatValue;
  }

  return value;
};

const toDisplayString = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return String(value);
};

const parsePathSegments = (path: string): string[] => {
  return path
    .replace(BRACKET_TOKEN_PATTERN, (_, index: string) => `.${index}`)
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
};

const setNestedValue = (
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void => {
  const segments = parsePathSegments(path);
  if (segments.length === 0) {
    return;
  }

  let current: Record<string, unknown> = target;

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (segment === undefined) {
      return;
    }
    const existing = current[segment];

    if (!isRecord(existing)) {
      const nextLevel: Record<string, unknown> = {};
      current[segment] = nextLevel;
      current = nextLevel;
      continue;
    }

    current = existing;
  }

  const lastSegment = segments[segments.length - 1];
  if (lastSegment === undefined) {
    return;
  }
  current[lastSegment] = value;
};

const normalizeIndexed = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeIndexed(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  const normalizedEntries: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    normalizedEntries[key] = normalizeIndexed(entryValue);
  }

  const keys = Object.keys(normalizedEntries);
  if (keys.length > 0 && keys.every((key) => NUMERIC_TOKEN_PATTERN.test(key))) {
    const parsedIndices = keys
      .map((key) => Number.parseInt(key, 10))
      .filter((index) => Number.isFinite(index) && index >= 0);
    if (parsedIndices.length === 0) {
      return normalizedEntries;
    }
    const maxIndex = Math.max(...parsedIndices);
    const result: unknown[] = new Array(maxIndex + 1).fill(undefined);
    for (const [key, entryValue] of Object.entries(normalizedEntries)) {
      const index = Number.parseInt(key, 10);
      if (!Number.isFinite(index) || index < 0) {
        continue;
      }
      result[index] = entryValue;
    }
    return result.map((item) =>
      item === undefined ? null : (item as unknown),
    );
  }

  return normalizedEntries;
};

const resolveFieldValue = (
  path: string,
  displayBuffers: Map<string, string>,
  valueBuffers: Map<string, unknown[]>,
): unknown => {
  const values = valueBuffers.get(path) ?? [];
  if (values.length === 0) {
    return displayBuffers.get(path) ?? "";
  }

  const last = values[values.length - 1];
  if (typeof last === "number" || typeof last === "boolean") {
    return last;
  }
  if (last === null) {
    return null;
  }

  const joined =
    displayBuffers.get(path) ??
    values.map((value) => toDisplayString(value)).join("");

  return coercePrimitive(joined);
};

export interface StreamAssemblerOptions {
  schema?: ZodTypeAny;
}

export interface StreamFeedResult {
  path: string;
  accumulated: string;
  snapshot: Record<string, string>;
}

export interface StreamFinalizeResult {
  type: "root" | "structured" | "empty";
  rootText?: string;
  structured?: unknown;
}

export class StreamAssembler {
  private readonly displayBuffers = new Map<string, string>();
  private readonly valueBuffers = new Map<string, unknown[]>();
  private readonly schema: ZodTypeAny | undefined;

  constructor(options: StreamAssemblerOptions = {}) {
    this.schema = options.schema;
  }

  public feed(chunk: {
    delta?: unknown;
    jsonPath?: string | null | undefined;
  }): StreamFeedResult | null {
    const { delta } = chunk;
    if (delta === null || delta === undefined) {
      return null;
    }

    const path =
      chunk.jsonPath === null || chunk.jsonPath === undefined
        ? STREAM_ROOT_PATH
        : chunk.jsonPath;

    const existingDisplay = this.displayBuffers.get(path) ?? "";
    const nextDisplay = `${existingDisplay}${toDisplayString(delta)}`;
    this.displayBuffers.set(path, nextDisplay);

    const existingValues = this.valueBuffers.get(path) ?? [];
    existingValues.push(delta);
    this.valueBuffers.set(path, existingValues);

    return {
      path,
      accumulated: nextDisplay,
      snapshot: this.snapshot(),
    };
  }

  public snapshot(): Record<string, string> {
    return Object.fromEntries(this.displayBuffers.entries());
  }

  public hasStructuredFields(): boolean {
    const keys = Array.from(this.displayBuffers.keys());
    return keys.some((key) => key !== STREAM_ROOT_PATH);
  }

  public finalize(): StreamFinalizeResult {
    if (this.displayBuffers.size === 0) {
      return { type: "empty" };
    }

    if (!this.hasStructuredFields()) {
      const root = this.displayBuffers.get(STREAM_ROOT_PATH) ?? "";
      return { type: "root", rootText: root };
    }

    const structured = this.reconstructStructured();
    let coerced: unknown = structured;
    if (this.schema !== undefined) {
      try {
        coerced = this.schema.parse(structured);
      } catch {
        coerced = structured;
      }
    }

    return { type: "structured", structured: coerced };
  }

  public getFieldBuffers(): Map<string, string> {
    return new Map(this.displayBuffers);
  }

  private reconstructStructured(): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const path of this.valueBuffers.keys()) {
      if (path === STREAM_ROOT_PATH) {
        continue;
      }
      const value = resolveFieldValue(
        path,
        this.displayBuffers,
        this.valueBuffers,
      );
      setNestedValue(result, path, value);
    }

    return normalizeIndexed(result) as Record<string, unknown>;
  }
}

export const createStreamAssembler = (
  options?: StreamAssemblerOptions,
): StreamAssembler => new StreamAssembler(options);
