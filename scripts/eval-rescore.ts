// Re-scores a saved model run on rule editions with no model call (src/eval/rescore.ts), and writes the public record
// (levels, rule ids, item ids and editions only: no read, no label text, no item name) and the /ran summary.
// The first block must be the run's own edition and date: it is the check that the re-score gives back the run.
//   npx tsx scripts/eval-rescore.ts --run eval/runs/private/models-2026-11-21.json \
//     --edition eval/runs/editions/byt-3b5f5508968f.json --date 2026-11-21 \
//     --edition eval/runs/editions/byt-d098b14aa534.json --date 2026-11-25 [--check]
// --check rebuilds both files from the private run and fails if either differs from the committed one.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isCalendarDate, parseEdition } from "../src/engine/edition";
import { typedCategoriesOf } from "../src/eval/baselines";
import { buildEvalSet, type SetLabels, type SetManifest } from "../src/eval/loadSet";
import { rescore, type SavedRun } from "../src/eval/rescore";
import { rescoreSummary, type RescoreRecord } from "../src/eval/rescoreRecord";
import { repoRoot } from "./lib/files";

export const RECORD = join("eval", "runs", "models-2026-11-21.rescored.public.json");
export const SUMMARY = join("src", "ran", "rescore.json");

const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

export function buildRecord(root: string, runPath: string, blocks: { editionPath: string; date: string }[]): RescoreRecord {
  for (const { date } of blocks) if (!isCalendarDate(date)) throw new Error(`${date} is not a calendar date (YYYY-MM-DD)`);
  const runBytes = readFileSync(runPath);
  const run = JSON.parse(runBytes.toString("utf8")) as SavedRun & { setId: string };
  const read = (...p: string[]) => JSON.parse(readFileSync(join(root, ...p), "utf8")) as unknown;
  const manifest = read("eval", "set", "manifest.json") as SetManifest;
  const labels = read("eval", "set", "labels.json") as SetLabels;
  const set = buildEvalSet(manifest, labels);
  const typed = typedCategoriesOf(labels, manifest);
  if (!blocks.length) throw new Error("give at least one --edition and --date");
  return {
    runId: run.runId, runSha256: sha256(runBytes), setId: run.setId,
    blocks: blocks.map(({ editionPath, date }, i) => {
      const bytes = readFileSync(editionPath);
      const edition = parseEdition(JSON.parse(bytes.toString("utf8")));
      const revision = edition.revision;
      if (revision === undefined) throw new Error(`${editionPath}: an edition with no revision cannot be named on /ran`);
      if (i === 0 && (edition.editionId !== run.editionId || date !== run.date)) {
        throw new Error(`the first block must be the run's own edition ${run.editionId} on ${run.date}`);
      }
      return {
        editionId: edition.editionId, revision, date,
        editionFile: relative(root, resolve(editionPath)), editionSha256: sha256(bytes),
        // On the run's own edition and date, a read whose saved label was cut is re-scored too: the published level it
        // must give back checks it. On any other edition it is not (src/eval/rescore.ts).
        rows: rescore(run, set, typed, edition, date, { scoreClipped: i === 0 }),
      };
    }),
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  const value = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  const runPath = value("--run");
  if (!runPath) throw new Error("--run <private run file> is required");
  const editions = argv.flatMap((a, i) => (a === "--edition" ? [argv[i + 1]!] : []));
  const dates = argv.flatMap((a, i) => (a === "--date" ? [argv[i + 1]!] : []));
  if (editions.length !== dates.length) throw new Error("give one --date after each --edition");
  const root = repoRoot();
  const record = buildRecord(root, runPath, editions.map((editionPath, i) => ({ editionPath, date: dates[i]! })));
  const lastEdition = parseEdition(JSON.parse(readFileSync(join(root, record.blocks[record.blocks.length - 1]!.editionFile), "utf8")));
  const summary = rescoreSummary(record, lastEdition);
  const files: [string, string][] = [[RECORD, json(record)], [SUMMARY, json(summary)]];
  if (argv.includes("--check")) {
    const stale = files.filter(([p, text]) => readFileSync(join(root, p), "utf8") !== text).map(([p]) => p);
    if (stale.length) throw new Error(`differs from the re-score of ${record.runId}: ${stale.join(", ")}`);
    console.log(`re-score check: ${files.map(([p]) => p).join(" and ")} match a fresh re-score of ${record.runId} (sha256 ${record.runSha256})`);
    return;
  }
  for (const [p, text] of files) writeFileSync(join(root, p), text);
  console.log(JSON.stringify(summary));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
