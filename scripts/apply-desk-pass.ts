// Applies a person's desk pass (the private sheet's results JSON) to the destination editions.
// A country gets personReviewedOn only when every one of its current lines was answered "same" and
// none has changed since the sheet was built. The results JSON itself is never committed: it holds
// a person's judgments, and only the date belongs in the public repository.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalJson, isCalendarDate, parseEdition, sha256Hex } from "../src/engine/edition";
import type { DestinationLine, RuleEdition } from "../src/engine/types";
import { repoRoot } from "./lib/files";

export interface DeskPassResults {
  checkedBy: string;
  checkedOn: string;
  builtFrom: string;
  lines: Record<string, { v: "same" | "wrong"; note?: string; h: string }>;
}

export interface DeskPassPlan {
  refusals: string[];
  countries: Record<string, { set: boolean; blocking: string[] }>;
}

// The same fingerprint the sheet generator shows Stephen: sha256 of the canonical JSON (sorted keys,
// no spaces, UTF-8) of what he judges for the line. Missing matches count as [], a missing reason as null.
export function deskLineHash(line: DestinationLine): Promise<string> {
  return sha256Hex(canonicalJson({
    lineSha256: line.lineSha256, ourWording: line.ourWording, matches: line.matches ?? [], noMatch: line.noMatch ?? null,
  }));
}

export async function planDeskPass(edition: RuleEdition, results: DeskPassResults, today: string): Promise<DeskPassPlan> {
  const refusals: string[] = [];
  const known = new Map<string, string>();
  for (const d of Object.values(edition.destinations)) for (const l of d.lines) known.set(l.lineId, d.code);

  if (!isCalendarDate(results.checkedOn)) refusals.push(`checkedOn is not a real date: ${results.checkedOn}`);
  else if (!isCalendarDate(today) || results.checkedOn > today) refusals.push(`checkedOn ${results.checkedOn} is after today (${today})`);
  for (const d of Object.values(edition.destinations)) {
    if (d.checkedOn && isCalendarDate(results.checkedOn) && results.checkedOn < d.checkedOn) {
      refusals.push(`checkedOn ${results.checkedOn} is before the builder read of ${d.code} on ${d.checkedOn}`);
    }
  }
  for (const [id, r] of Object.entries(results.lines)) {
    if (!known.has(id)) refusals.push(`${id}: not a line in this edition`);
    if (r.v !== "same" && r.v !== "wrong") refusals.push(`${id}: the answer must be same or wrong`);
    if (!/^[0-9a-f]{64}$/.test(r.h)) refusals.push(`${id}: the fingerprint is not a sha256 hex digest`);
  }

  const countries: DeskPassPlan["countries"] = {};
  for (const d of Object.values(edition.destinations)) {
    const blocking: string[] = [];
    for (const l of d.lines) {
      const r = results.lines[l.lineId];
      if (!r) blocking.push(`${l.lineId}: not answered`);
      else if (r.h !== (await deskLineHash(l))) blocking.push(`${l.lineId}: changed since the sheet was built, send it back to Stephen`);
      else if (r.v !== "same") blocking.push(`${l.lineId}: marked wrong`);
    }
    countries[d.code] = { set: refusals.length === 0 && blocking.length === 0, blocking };
  }
  return { refusals, countries };
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) throw new Error("usage: npm run desk:apply -- <path to the desk-pass results JSON>");
  const root = repoRoot();
  const edition = parseEdition(JSON.parse(readFileSync(join(root, "rules", "edition.json"), "utf8")));
  const results = JSON.parse(readFileSync(resolve(file), "utf8")) as DeskPassResults;
  const today = new Date().toLocaleDateString("en-CA");
  const plan = await planDeskPass(edition, results, today);
  for (const r of plan.refusals) console.error(`refused: ${r}`);
  for (const [code, c] of Object.entries(plan.countries)) {
    if (!c.set) {
      console.log(`${code}: not set (${c.blocking.length} line(s) block it)`);
      for (const b of c.blocking) console.log(`  ${b}`);
      continue;
    }
    const path = join(root, "rules", "destinations", `${code}.json`);
    const text = readFileSync(path, "utf8");
    const from = '"personReviewedOn": null';
    if (text.split(from).length !== 2) throw new Error(`${code}.json: expected exactly one ${from}`);
    writeFileSync(path, text.replace(from, `"personReviewedOn": "${results.checkedOn}"`));
    console.log(`${code}: personReviewedOn set to ${results.checkedOn}. Next: npm run edition, then commit this country alone.`);
  }
  process.exit(plan.refusals.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
