import { describe, expect, it } from "vitest";
import { readCostUsd } from "./live-read-cost";

const prices = { inputPerMillionUsd: 0.3, outputPerMillionUsd: 2.5 };

describe("readCostUsd", () => {
  it("prices input tokens at the input rate and output plus thinking tokens at the output rate", () => {
    // 1,000,000 in, 100,000 out, 100,000 thinking: 0.30 + 0.25 + 0.25.
    expect(readCostUsd({ promptTokenCount: 1_000_000, candidatesTokenCount: 100_000, thoughtsTokenCount: 100_000 }, prices)).toBeCloseTo(0.8, 10);
  });

  it("counts missing counts as zero and refuses negative or non-number ones", () => {
    expect(readCostUsd({ promptTokenCount: 2000 }, prices)).toBeCloseTo(0.0006, 10);
    expect(() => readCostUsd({ promptTokenCount: -1 }, prices)).toThrow(/token count/);
    expect(() => readCostUsd({ promptTokenCount: Number.NaN }, prices)).toThrow(/token count/);
  });
});
