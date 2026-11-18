// The four rule layers behind every verdict, each with its edition and check date.
// The caller passes today's date; the engine never reads a clock. Every client passes the device's own
// local calendar date (YYYY-MM-DD in its own time zone), so staleness is counted in the sender's days.
import { isCalendarDate } from "./edition";
import type { DestinationContext, LayerStatus, RuleEdition } from "./types";

const DAY_MS = 86_400_000;

// Null when either date is not a real calendar date, so the layer fails closed.
function ageInDays(checkedOn: string, today: string): number | null {
  if (!isCalendarDate(checkedOn) || !isCalendarDate(today)) return null;
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${checkedOn}T00:00:00Z`)) / DAY_MS);
}

function layer(
  id: LayerStatus["id"], label: string, edition: string, checkedOn: string | null, present: boolean, staleDays: number, today: string,
): LayerStatus {
  let state: LayerStatus["state"] = "missing";
  const age = present && checkedOn ? ageInDays(checkedOn, today) : null;
  // A check dated after today cannot vouch for today, so it counts as missing, never fresh.
  if (age !== null && age >= 0) state = age > staleDays ? "stale" : "checked";
  return { id, label, edition, checkedOn, state };
}

// Who read a country's rules, and when: a person, or us from the USPS page (not yet checked by a person).
// The card's layer label and the destination picker both say only this, so they can never disagree.
export type RulesReadBy = { by: "person" | "usps_page"; on: string };

export function rulesReadBy(dest: DestinationContext): RulesReadBy | null {
  const d = dest.edition;
  if (dest.reviewState !== "reviewed" || d === null) return null;
  if (d.personReviewedOn) return { by: "person", on: d.personReviewedOn };
  return d.checkedOn ? { by: "usps_page", on: d.checkedOn } : null;
}

export function layerStatuses(edition: RuleEdition, dest: DestinationContext, today: string): LayerStatus[] {
  const stale = edition.limits.staleDays;
  const usps = edition.sources.find((s) => s.id === "usps_export");
  const d = dest.edition;
  const reviewed = dest.reviewState === "reviewed" && d !== null;
  const immEdition = d ? `IMM ${d.immEdition}` : "not loaded";
  // Say who read the listing: never claim a person checked it before personReviewedOn is set.
  const readBy = rulesReadBy(dest);
  let destLabel = `${dest.name} rules`;
  if (readBy?.by === "person") destLabel += `: checked by a person on ${readBy.on}`;
  else if (readBy?.by === "usps_page") destLabel += `: read from the USPS page on ${readBy.on}, not yet checked by a person`;
  return [
    layer("usps_export", "USPS export rules", usps?.edition ?? "not loaded", usps?.checkedOn ?? null, Boolean(usps), stale.usps_export, today),
    layer("destination", destLabel, immEdition, d?.checkedOn ?? null, reviewed, stale.destination, today),
    layer("suspensions", "Service suspensions", `Updated ${edition.suspensions.updated}`, edition.suspensions.checkedOn, true,
      stale.suspensions, today),
    layer("customs", `${dest.name} customs`, immEdition, d?.checkedOn ?? null, reviewed && Boolean(d?.customsChecked), stale.customs, today),
  ];
}
