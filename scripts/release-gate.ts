// Release gate (plan Task 42): run before submission, not on every commit. It exits 1 while any
// bundled destination listing has not been checked line by line by a person, so the app is
// never released claiming person-reviewed rules that only the builder has read.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isCalendarDate, parseEdition } from "../src/engine/edition";
import type { RuleEdition } from "../src/engine/types";
import { repoRoot } from "./lib/files";

const DAY_MS = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

// A person's check must exist, be dated no later than today, and be no older than the
// destination freshness limit; anything else fails the release.
export function releaseGateProblems(edition: RuleEdition, today: string): string[] {
  if (!isCalendarDate(today)) return [`today is not a real date: ${today}`];
  const listings = Object.values(edition.destinations);
  if (listings.length === 0) return ["the edition has no destination listings"];
  const maxAge = edition.limits.staleDays.destination;
  const problems: string[] = [];
  for (const d of listings) {
    const on = d.personReviewedOn;
    if (on === null) problems.push(`${d.code}: no person has checked this listing against our wording yet (personReviewedOn is null)`);
    else if (days(on, today) < 0) problems.push(`${d.code}: the person check is dated ${on}, after today (${today})`);
    else if (days(on, today) > maxAge) problems.push(`${d.code}: the person check from ${on} is older than ${maxAge} days`);
  }
  return problems;
}

function main(): void {
  const edition = parseEdition(JSON.parse(readFileSync(join(repoRoot(), "rules", "edition.json"), "utf8")));
  // Today in this computer's own time zone, as YYYY-MM-DD.
  const today = new Date().toLocaleDateString("en-CA");
  const problems = releaseGateProblems(edition, today);
  for (const p of problems) console.error(p);
  console.log(`release gate: ${Object.keys(edition.destinations).length} listings, ${problems.length ? "FAILED" : "passed"}`);
  process.exit(problems.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
