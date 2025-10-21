import { describe, it, expect } from "vitest";
import { z } from "zod";

import { createStreamAssembler } from "../../../src/utils/streaming";

describe("StreamAssembler", () => {
  it("accumulates root text when no jsonPath provided", () => {
    const assembler = createStreamAssembler();

    const first = assembler.feed({ delta: "Hello", jsonPath: undefined });
    const second = assembler.feed({ delta: " world", jsonPath: undefined });

    expect(first).not.toBeNull();
    expect(second?.accumulated).toBe("Hello world");

    const finalize = assembler.finalize();
    expect(finalize.type).toBe("root");
    expect(finalize.rootText).toBe("Hello world");
  });

  it("reconstructs structured payloads with arrays and numeric coercion", () => {
    const assembler = createStreamAssembler();

    assembler.feed({ delta: "analyze", jsonPath: "response.reasoning" });
    assembler.feed({
      delta: "3",
      jsonPath: "response.steps[0].count",
    });
    assembler.feed({
      delta: "tool.search",
      jsonPath: "response.steps[0].name",
    });
    assembler.feed({
      delta: "true",
      jsonPath: "response.steps[0].complete",
    });

    const finalize = assembler.finalize();
    expect(finalize.type).toBe("structured");
    const structured = finalize.structured as Record<string, unknown>;
    expect(structured).toEqual({
      response: {
        reasoning: "analyze",
        steps: [
          {
            count: 3,
            name: "tool.search",
            complete: true,
          },
        ],
      },
    });
  });

  it("applies schema parsing when provided", () => {
    const schema = z.object({
      reasoning: z.string(),
      confidence: z.number(),
    });
    const assembler = createStreamAssembler({ schema });

    assembler.feed({ delta: "0.85", jsonPath: "confidence" });
    assembler.feed({ delta: "All set", jsonPath: "reasoning" });

    const finalize = assembler.finalize();
    expect(finalize.type).toBe("structured");
    expect(finalize.structured).toEqual({
      reasoning: "All set",
      confidence: 0.85,
    });
  });

  it("skips chunks with missing deltas", () => {
    const assembler = createStreamAssembler();

    const first = assembler.feed({ delta: "Task", jsonPath: "_root" });
    const skipped = assembler.feed({ delta: undefined, jsonPath: "_root" });

    expect(first?.accumulated).toBe("Task");
    expect(skipped).toBeNull();

    const finalize = assembler.finalize();
    expect(finalize.type).toBe("root");
    expect(finalize.rootText).toBe("Task");
  });

  it("treats malformed JSON paths as literal keys", () => {
    const assembler = createStreamAssembler();

    assembler.feed({
      delta: "42",
      jsonPath: "response.steps[not-an-index].count",
    });

    const finalize = assembler.finalize();
    expect(finalize.type).toBe("structured");
    const structured = finalize.structured as Record<string, unknown>;
    expect(structured).toEqual({
      response: {
        "steps[not-an-index]": {
          count: 42,
        },
      },
    });
  });

  it("preserves partial state when a stream is aborted mid-field", () => {
    const assembler = createStreamAssembler();

    assembler.feed({
      delta: "Progress: ",
      jsonPath: "_root",
    });
    assembler.feed({
      delta: "50",
      jsonPath: "metrics.completion",
    });
    // Simulate abort by not feeding the remaining chunks.

    const snapshot = assembler.snapshot();
    expect(snapshot).toEqual({
      _root: "Progress: ",
      "metrics.completion": "50",
    });

    const finalize = assembler.finalize();
    expect(finalize.type).toBe("structured");
    const structured = finalize.structured as Record<string, unknown>;
    expect(structured).toEqual({
      metrics: {
        completion: 50,
      },
    });
  });
});
