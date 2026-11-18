// The four rule layers behind every verdict, each with its edition and check date.
// The caller passes today's date; the engine never reads a clock.
import type { DestinationContext, LayerStatus, RuleEdition } from "./types";

const DAY_MS = 86_400_000;

function ageInDays(checkedOn: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${checkedOn}T00:00:00Z`)) / DAY_MS);
}

function layer(
  id: LayerStatus["id"], label: string, edition: string, checkedOn: string | null, present: boolean, staleDays: number, today: string,
): LayerStatus {
  let state: LayerStatus["state"] = "missing";
  if (present && checkedOn) state = ageInDays(checkedOn, today) > staleDays ? "stale" : "checked";
  return { id, label, edition, checkedOn, state };
}

export function layerStatuses(edition: RuleEdition, dest: DestinationContext, today: string): LayerStatus[] {
  const stale = edition.limits.staleDays;
  const usps = edition.sources.find((s) => s.id === "usps_export");
  const d = dest.edition;
  const reviewed = dest.reviewState === "reviewed" && d !== null;
  const immEdition = d ? `IMM ${d.immEdition}` : "not loaded";
  return [
    layer("usps_export", "USPS export rules", usps?.edition ?? "not loaded", usps?.checkedOn ?? null, Boolean(usps), stale.usps_export, today),
    layer("destination", `${dest.name} rules`, immEdition, d?.checkedOn ?? null, reviewed, stale.destination, today),
    layer("suspensions", "Service suspensions", `Updated ${edition.suspensions.updated}`, edition.suspensions.checkedOn, true,
      stale.suspensions, today),
    layer("customs", `${dest.name} customs`, immEdition, d?.checkedOn ?? null, reviewed && Boolean(d?.customsChecked), stale.customs, today),
  ];
}
