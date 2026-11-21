import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evalFromRuns } from "../../scripts/ran-eval";

// So the numbers /ran shows about our own test are never typed by hand: the committed file must be exactly what
// scripts/ran-eval.ts derives from the newest public model run.
describe("src/ran/eval.json", () => {
  it("matches the newest public model run in eval/runs", () => {
    expect(JSON.parse(readFileSync("src/ran/eval.json", "utf8"))).toEqual(evalFromRuns(process.cwd()));
  });
});
