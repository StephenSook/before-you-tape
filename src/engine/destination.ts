// Destination checks: the country's listing lines matched against the item's tags, plus
// the destination-level states (suspended, not reviewed, no list) that block "OK to pack".
import type { DestinationContext, DestinationLine, ItemAnswers, ItemFacts, RuleHit } from "./types";

const SUSPENSIONS_URL = "https://about.usps.com/newsroom/service-alerts/international/";
const COUNTRY_INDEX_URL = "https://pe.usps.com/text/imm/immctry.htm";

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
