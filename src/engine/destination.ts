// Destination checks: the country's listing lines matched against the item's tags, plus
// the destination-level states (suspended, not reviewed, no list) that block "OK to pack".
import type { DestinationContext, DestinationLine, ItemAnswers, ItemFacts, RuleHit } from "./types";

const SUSPENSIONS_URL = "https://about.usps.com/newsroom/service-alerts/international/";
const COUNTRY_INDEX_URL = "https://pe.usps.com/text/imm/immctry.htm";

// "2026-11-29" as "November 29, 2026", the same in every engine (no locale formatting).
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const longDate = (iso: string): string => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;

const SECTION_NAME: Record<DestinationLine["section"], string> = {
  prohibitions: "Prohibitions",
  restrictions: "Restrictions",
  observations: "Observations",
};

export function evaluateDestination(facts: ItemFacts, answers: ItemAnswers, dest: DestinationContext): RuleHit[] {
  const hits: RuleHit[] = [];
  const url = dest.edition?.immUrl ?? COUNTRY_INDEX_URL;

  if (dest.suspended) {
    hits.push({
      ruleId: "DEST-SUSPENDED", layer: "destination", level: "check", section: "USPS international service alerts",
      url: SUSPENSIONS_URL, text: `Mail to ${dest.name} is suspended right now. Nothing in this box can go until service returns.`,
    });
  }
  if (!dest.suspended && dest.suspendsFrom) {
    hits.push({
      ruleId: "DEST-SUSPENSION-AHEAD", layer: "destination", level: "note", section: "USPS international service alerts",
      url: SUSPENSIONS_URL, text: `The post office stops taking mail to ${dest.name} on ${longDate(dest.suspendsFrom)}. Mail this box before then.`,
    });
  }
  if (dest.reviewState === "not_loaded" || dest.reviewState === "live_unreviewed") {
    hits.push({
      ruleId: "DATA-DEST-UNREVIEWED", layer: "data", level: "check", section: "IMM country listing", url,
      text: "We have not reviewed this country. Read its listing before you pack.",
    });
  }
  if (dest.reviewState === "no_list_furnished") {
    hits.push({
      ruleId: "DATA-DEST-NO-LIST", layer: "data", level: "check", section: "IMM country listing", url,
      text: "This country's listing gives no list. That does not mean everything is allowed.",
    });
  }

  for (const line of dest.edition?.lines ?? []) {
    let level: "take_out" | "check" | null = null;
    for (const m of line.matches) {
      if (!facts.tags.includes(m.tag)) continue;
      if (m.unlessAnswer && answers[m.unlessAnswer.questionId] === m.unlessAnswer.answerId) continue;
      if (m.effect === "take_out" || level === null) level = m.effect;
    }
    if (level) {
      hits.push({
        ruleId: line.lineId, layer: "destination", level, text: line.ourWording,
        section: `IMM ${dest.name}, ${SECTION_NAME[line.section]}`, url,
      });
    }
  }
  return hits;
}
