// Fails CI when a rule layer would read stale before judging ends. A stale layer turns every "OK to pack" into
// "Check this", so the rules must stay fresh through the last judging day, by the same rule the app applies.
// Before the re-read window opens it only warns, so the work it asks for (reading the USPS pages again and
// redeploying) has its window; from the window's first day on, it fails until the layer is read again.
//   npm run fresh
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEdition, resolveDestination } from "../src/engine/edition";
import { layerStatuses } from "../src/engine/layers";
import type { RuleEdition } from "../src/engine/types";
import { repoRoot } from "./lib/files";
import { LAST_JUDGING_DAY } from "./release-gate";

// The first day of the window to read the USPS pages again and redeploy, before judging starts.
export const REREAD_FROM = "2026-11-27";

const DAY_MS = 86_400_000;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

export interface StaleLayer { code: string; layer: string; checkedOn: string; staleFrom: string }

// Each layer, per destination, that reads "checked" today but would read "stale" on some day through the last
// judging day, with the first such day. A layer never checked is the release gate's to report, not this check's.
export function staleBeforeJudgingEnds(edition: RuleEdition, lastDay: string = LAST_JUDGING_DAY): StaleLayer[] {
  const out: StaleLayer[] = [];
  for (const code of Object.keys(edition.destinations)) {
    for (const layer of layerStatuses(edition, resolveDestination(edition, code), lastDay)) {
      if (layer.state !== "stale" || layer.checkedOn === null) continue;
      const limit = edition.limits.staleDays[layer.id];
      out.push({ code, layer: layer.id, checkedOn: layer.checkedOn, staleFrom: addDays(layer.checkedOn, limit + 1) });
    }
  }
  return out;
}

export function freshness(edition: RuleEdition, today: string, lastDay: string = LAST_JUDGING_DAY): { exit: 0 | 1; lines: string[] } {
  const stale = staleBeforeJudgingEnds(edition, lastDay);
  if (stale.length === 0) return { exit: 0, lines: [`rules fresh through ${lastDay}: every layer reads checked`] };
  const fail = today >= REREAD_FROM;
  const lines = stale.map((s) => `${fail ? "error" : "warning"}: ${s.code} ${s.layer} (last read ${s.checkedOn}) reads stale from ${s.staleFrom}, before judging ends on ${lastDay}`);
  lines.push(fail
    ? `rules not fresh through ${lastDay}: read the USPS pages again, rebuild the edition and deploy`
    : `rules not fresh through ${lastDay} yet: read the USPS pages again from ${REREAD_FROM}; this check fails from then on`);
  return { exit: fail ? 1 : 0, lines };
}

function main(): void {
  const edition = parseEdition(JSON.parse(readFileSync(join(repoRoot(), "rules", "edition.json"), "utf8")));
  const today = new Date().toISOString().slice(0, 10);
  const { exit, lines } = freshness(edition, today);
  for (const l of lines) (exit ? console.error : console.log)(l);
  process.exit(exit);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
