import { describe, expect, it } from "vitest";

import { Result, err, ok } from "@/base/result";

describe("Result helpers", () => {
  it("creates ok and err variants", () => {
    const success = ok(42);
    const failure = err(new Error("boom"));

    expect(success.ok).toBe(true);
    expect(failure.ok).toBe(false);
    expect(failure.error).toBeInstanceOf(Error);
  });

  it("maps values and errors", () => {
    const mapped = Result.map(ok(2), (value) => value * 2);
    const mappedError = Result.mapError(
      err(new Error("boom")),
      (error) => error.message,
    );

    expect(Result.isOk(mapped)).toBe(true);
    if (Result.isOk(mapped)) {
      expect(mapped.value).toBe(4);
    }

    expect(Result.isErr(mappedError)).toBe(true);
    if (Result.isErr(mappedError)) {
      expect(mappedError.error).toBe("boom");
    }
  });

  it("unwraps with fallback", () => {
    const value = Result.unwrapOr(ok("data"), "fallback");
    const fallback = Result.unwrapOr(err("oops"), "fallback");

    expect(value).toBe("data");
    expect(fallback).toBe("fallback");
  });
});
