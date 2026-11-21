// Writes what /ran says about our own test from the newest public model run in eval/runs: prints the summary, and
// with --write puts it in src/ran/eval.json (src/ran/evalSummary.ts). A test fails if that file and the run disagree.
//
//   npx tsx scripts/ran-eval.ts            (prints the summary)
//   npx tsx scripts/ran-eval.ts --write    (writes src/ran/eval.json)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { summarizeEval } from "../src/ran/evalSummary";
import { repoRoot } from "./lib/files";

const RUN = /^models-(\d{4}-\d{2}-\d{2})\.public\.json$/;

export function newestRun(names: readonly string[]): string | null {
  return names.filter((n) => RUN.test(n)).sort().at(-1) ?? null;
}

export function evalFromRuns(root: string) {
  const dir = join(root, "eval", "runs");
  const name = newestRun(readdirSync(dir));
  if (!name) throw new Error("no public model run in eval/runs");
  return summarizeEval(JSON.parse(readFileSync(join(dir, name), "utf8")), `eval/runs/${name}`);
}

function main() {
  const text = `${JSON.stringify(evalFromRuns(repoRoot()), null, 2)}\n`;
  if (!process.argv.includes("--write")) { process.stdout.write(text); return; }
  writeFileSync(join(repoRoot(), "src", "ran", "eval.json"), text);
  console.log("wrote src/ran/eval.json");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (e) { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); }
}
