// Release gate (plan Task 42): run before submission, not on every commit. It exits 1 while any
// bundled destination listing has not been checked line by line by a person, so the app is
// never released claiming person-reviewed rules that only the builder has read.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEdition } from "../src/engine/edition";
import type { RuleEdition } from "../src/engine/types";
import { repoRoot } from "./lib/files";

export function releaseGateProblems(edition: RuleEdition): string[] {
  const listings = Object.values(edition.destinations);
  if (listings.length === 0) return ["the edition has no destination listings"];
  return listings
    .filter((d) => d.personReviewedOn === null)
    .map((d) => `${d.code}: no person has checked this listing against our wording yet (personReviewedOn is null)`);
}

function main(): void {
  const edition = parseEdition(JSON.parse(readFileSync(join(repoRoot(), "rules", "edition.json"), "utf8")));
  const problems = releaseGateProblems(edition);
  for (const p of problems) console.error(p);
  console.log(`release gate: ${Object.keys(edition.destinations).length} listings, ${problems.length ? "FAILED" : "passed"}`);
  process.exit(problems.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
