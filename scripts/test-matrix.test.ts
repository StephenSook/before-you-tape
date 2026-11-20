// docs/TEST-MATRIX.md names only tracked evidence, says when a path has none, and cites lines that still
// hold the mode they name.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COLUMNS, matrixProblems, matrixRows } from "./test-matrix";

const tracked = new Set(execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n"));
const lineOf = (file: string, n: number): string | null => (existsSync(file) ? readFileSync(file, "utf8").split("\n")[n - 1] ?? null : null);
const doc = readFileSync("docs/TEST-MATRIX.md", "utf8");
const header = `| ${COLUMNS.join(" | ")} |\n|${COLUMNS.map(() => "---").join("|")}|\n`;
const row = (mode: string, result: string, evidence: string) => `| Web | Test | ${mode} | m | h | c | 2026-11-20 | ${result} | ${evidence} |\n`;

describe("docs/TEST-MATRIX.md", () => {
  it("names only tracked evidence, and every cited line still holds its mode", () => {
    expect(matrixProblems(doc, (p) => tracked.has(p), lineOf)).toEqual([]);
    expect(matrixRows(doc).length).toBeGreaterThanOrEqual(6);
  });

  it("fails on an evidence path that is not tracked", () => {
    const md = header + row("No model", "ok", "`docs/evidence/not-a-real-run.json`");
    expect(matrixProblems(md, (p) => tracked.has(p), lineOf)).toEqual(["Web, Test: docs/evidence/not-a-real-run.json is not tracked in git"]);
  });

  it("fails on a cited line that no longer holds its mode", () => {
    const md = header + row("`InferenceMode.ONLY_IN_CLOUD` at `README.md:1`", "ok", "`README.md`");
    expect(matrixProblems(md, (p) => tracked.has(p), lineOf)).toEqual(["Web, Test: README.md:1 no longer holds InferenceMode.ONLY_IN_CLOUD"]);
  });

  it("fails on a row with no evidence that does not say so", () => {
    const md = header + row("No model", "Passed", "None");
    expect(matrixProblems(md, () => true, lineOf)).toEqual(['Web, Test: no evidence, so the result must say "No tracked run yet" or "Not part of this entry"']);
  });
});
