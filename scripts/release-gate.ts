// Release gate (plan Task 42): run before submission, not on every commit. It exits 1 while any
// bundled destination listing has neither a person's line-by-line check (the edition's personReviewedOn) nor an
// approval as a whole in rules/reviews.json (two AI reviews of each line, then the project owner's approval of
// those same lines), so the app is never released on rules that only the builder has read.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalJson, isCalendarDate, parseEdition, resolveDestination } from "../src/engine/edition";
import { layerStatuses } from "../src/engine/layers";
import type { RuleEdition } from "../src/engine/types";
import { approvalOf, readReviews, type Reviews } from "../src/rules/reviews";
import { repoRoot } from "./lib/files";

// The last judging day. The site must not need a change after the deadline, so every layer the app
// shows has to stay fresh through this date, by the same rule the app itself applies.
export const LAST_JUDGING_DAY = "2026-12-16";

const DAY_MS = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

// A person's check, or an approval as a whole whose lines are still the approved ones, must exist, be dated no later
// than today, and be no older than the destination freshness limit, and every layer must still read "checked" on the
// last judging day; anything else fails the release.
export function releaseGateProblems(edition: RuleEdition, today: string, lastDay: string = LAST_JUDGING_DAY,
  reviews: Reviews = { listings: {} }): string[] {
  if (!isCalendarDate(today)) return [`today is not a real date: ${today}`];
  const listings = Object.values(edition.destinations);
  if (listings.length === 0) return ["the edition has no destination listings"];
  const maxAge = edition.limits.staleDays.destination;
  const problems: string[] = [];
  const dated = (code: string, what: string, on: string) =>
    days(on, today) < 0 ? `${code}: the ${what} is dated ${on}, after today (${today})`
      : days(on, today) > maxAge ? `${code}: the ${what} from ${on} is older than ${maxAge} days` : null;
  for (const d of listings) {
    const on = d.personReviewedOn;
    const approval = approvalOf(reviews, d.code);
    if (on !== null) {
      const p = dated(d.code, "person check", on);
      if (p) problems.push(p);
    } else if (approval) {
      const lines = createHash("sha256").update(canonicalJson(d.lines)).digest("hex");
      if (lines !== approval.linesSha256) problems.push(`${d.code}: the lines changed after the approval of ${approval.personApprovedOn} (approved ${approval.linesSha256.slice(0, 12)}, now ${lines.slice(0, 12)})`);
      for (const p of [dated(d.code, "AI check", approval.aiCheckedOn), dated(d.code, "approval", approval.personApprovedOn)]) if (p) problems.push(p);
    } else {
      problems.push(`${d.code}: no person has checked this listing against our wording yet (personReviewedOn is null, and rules/reviews.json has no approval)`);
    }
  }
  for (const d of listings) {
    for (const layer of layerStatuses(edition, resolveDestination(edition, d.code), lastDay)) {
      if (layer.state !== "checked") {
        problems.push(`${d.code}: the ${layer.id} layer would read ${layer.state} on ${lastDay} (last checked ${layer.checkedOn ?? "never"}, limit ${edition.limits.staleDays[layer.id]} days)`);
      }
    }
  }
  return problems;
}

function main(): void {
  const edition = parseEdition(JSON.parse(readFileSync(join(repoRoot(), "rules", "edition.json"), "utf8")));
  // Today in this computer's own time zone, as YYYY-MM-DD.
  const today = new Date().toLocaleDateString("en-CA");
  const reviews = readReviews(JSON.parse(readFileSync(join(repoRoot(), "rules", "reviews.json"), "utf8")));
  const problems = releaseGateProblems(edition, today, LAST_JUDGING_DAY, reviews);
  for (const p of problems) console.error(p);
  console.log(`release gate: ${Object.keys(edition.destinations).length} listings, ${problems.length ? "FAILED" : "passed"}`);
  process.exit(problems.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
