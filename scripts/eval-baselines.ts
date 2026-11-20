// Runs one eval baseline on the committed set, with no model call, and prints its metrics.
//   npm run eval:baseline -- --baseline always_check --date 2026-11-21 [--out eval/runs/always_check.json]
// rules_only needs every item's typed category in eval/set/labels.json ("typed"), recorded before the freeze.
import { readFileSync, writeFileSync } from "node:fs";
import { arch, platform } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isCalendarDate, parseEdition } from "../src/engine/edition";
import { alwaysCheckRun, rulesOnlyRun, typedCategoriesOf } from "../src/eval/baselines";
import { buildEvalSet, type SetLabels, type SetManifest } from "../src/eval/loadSet";
import { computeEvalMetrics } from "../src/eval/metrics";
import type { EvalRun, EvalSet } from "../src/eval/types";
import { repoRoot } from "./lib/files";

export const BASELINES = ["always_check", "rules_only"] as const;
export type Baseline = (typeof BASELINES)[number];
export interface BaselineArgs { baseline: Baseline; date: string; out: string | null }

export function parseBaselineArgs(argv: readonly string[]): BaselineArgs {
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] ?? null : null;
  };
  const baseline = value("--baseline");
  if (!baseline || !(BASELINES as readonly string[]).includes(baseline)) throw new Error(`--baseline must be one of ${BASELINES.join(", ")}`);
  const date = value("--date");
  if (!date || !isCalendarDate(date)) throw new Error("--date must be the day the rules are applied, YYYY-MM-DD");
  return { baseline: baseline as Baseline, date, out: value("--out") };
}

export function runBaseline(root: string, args: BaselineArgs): { set: EvalSet; run: EvalRun } {
  const read = (...p: string[]) => JSON.parse(readFileSync(join(root, ...p), "utf8")) as unknown;
  const manifest = read("eval", "set", "manifest.json") as SetManifest;
  const labels = read("eval", "set", "labels.json") as SetLabels;
  const edition = parseEdition(read("rules", "edition.json"));
  const set = buildEvalSet(manifest, labels);
  const meta = { date: args.date, machine: `${platform()} ${arch()}`, editionId: edition.editionId };
  const run = args.baseline === "always_check" ? alwaysCheckRun(set, meta) : rulesOnlyRun(set, typedCategoriesOf(labels, manifest), edition, meta);
  return { set, run };
}

function main() {
  const args = parseBaselineArgs(process.argv.slice(2));
  const { set, run } = runBaseline(repoRoot(), args);
  if (args.out) writeFileSync(args.out, JSON.stringify(run, null, 2) + "\n");
  const m = computeEvalMetrics(set, run);
  console.log(JSON.stringify({ runId: run.runId, editionId: run.editionId, rows: run.rows.length, truthAgreement: m.truthAgreement, hazardCalledOk: m.hazardCalledOk, checkRate: m.checkRate }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
