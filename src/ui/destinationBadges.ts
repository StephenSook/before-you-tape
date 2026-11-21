// A short badge per country for the destination picker, from the same suspension rules the verdicts use: one the
// post office has announced ("USPS stops Nov 29"), and one in force ("USPS suspended").
import { resolveDestination } from "../engine/edition";
import type { RuleEdition } from "../engine/types";

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso: string) => `${SHORT_MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

export function destinationBadges(edition: RuleEdition, codes: readonly string[], today: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const code of codes) {
    const d = resolveDestination(edition, code, undefined, today);
    if (d.suspended) out[code] = "USPS suspended";
    else if (d.suspendsFrom) out[code] = `USPS stops ${shortDate(d.suspendsFrom)}`;
  }
  return out;
}
