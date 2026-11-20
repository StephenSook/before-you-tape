// The baseline runner on the committed eval set and rule edition, copied to a scratch root so the test does
// not depend on whether the typed categories have been recorded yet.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SetLabels, SetManifest } from "../src/eval/loadSet";
import { computeEvalMetrics } from "../src/eval/metrics";
import { parseBaselineArgs, runBaseline } from "./eval-baselines";

const repo = process.cwd();
const manifest = JSON.parse(readFileSync(join(repo, "eval/set/manifest.json"), "utf8")) as SetManifest;
const labels = JSON.parse(readFileSync(join(repo, "eval/set/labels.json"), "utf8")) as SetLabels;
let roots: string[] = [];
const rootWith = (l: SetLabels) => {
  const root = mkdtempSync(join(tmpdir(), "byt-baseline-"));
  roots.push(root);
  mkdirSync(join(root, "eval/set"), { recursive: true });
  mkdirSync(join(root, "rules"));
  copyFileSync(join(repo, "eval/set/manifest.json"), join(root, "eval/set/manifest.json"));
  copyFileSync(join(repo, "rules/edition.json"), join(root, "rules/edition.json"));
  writeFileSync(join(root, "eval/set/labels.json"), JSON.stringify(l));
  return root;
};
afterEach(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); roots = []; });
const untyped: SetLabels = { ...labels, typed: undefined };
const allOther: SetLabels = { ...labels, typed: Object.fromEntries(manifest.items.map((i) => [i.itemId, { category: "other" }])) };

describe("parseBaselineArgs", () => {
  it("takes a baseline, the day the rules apply, and an optional output file", () => {
    expect(parseBaselineArgs(["--baseline", "rules_only", "--date", "2026-11-21", "--out", "r.json"])).toEqual({ baseline: "rules_only", date: "2026-11-21", out: "r.json" });
    expect(parseBaselineArgs(["--baseline", "always_check", "--date", "2026-11-21"]).out).toBeNull();
  });

  it("refuses an unknown baseline and a missing or impossible date", () => {
    expect(() => parseBaselineArgs(["--baseline", "model", "--date", "2026-11-21"])).toThrow(/--baseline must be one of always_check, rules_only/);
    expect(() => parseBaselineArgs(["--baseline", "always_check"])).toThrow(/--date/);
    expect(() => parseBaselineArgs(["--baseline", "always_check", "--date", "2026-02-30"])).toThrow(/--date/);
  });
});

describe("runBaseline on the committed set", () => {
  it("runs always Check this over every item and destination, never calling a hazard OK", () => {
    const { set, run } = runBaseline(rootWith(untyped), { baseline: "always_check", date: "2026-11-21", out: null });
    expect(run.rows).toHaveLength(manifest.items.length * manifest.destinations.length);
    const m = computeEvalMetrics(set, run);
    expect(m.hazardCalledOk.k).toBe(0);
    expect(m.checkRate).toEqual({ k: run.rows.length, n: run.rows.length });
  });

  it("refuses rules only until every item has a typed category", () => {
    expect(() => runBaseline(rootWith(untyped), { baseline: "rules_only", date: "2026-11-21", out: null })).toThrow(/no typed category: own-01/);
  });

  it("runs rules only with the shipped edition once every item is typed", () => {
    const { run } = runBaseline(rootWith(allOther), { baseline: "rules_only", date: "2026-11-21", out: null });
    expect(run.rows).toHaveLength(manifest.items.length * manifest.destinations.length);
    expect(run.editionId).toBe((JSON.parse(readFileSync(join(repo, "rules/edition.json"), "utf8")) as { editionId: string }).editionId);
    expect(run.rows.every((r) => r.shipped.source === "rules_only" && r.device === null && r.cloud === null)).toBe(true);
  });
});
