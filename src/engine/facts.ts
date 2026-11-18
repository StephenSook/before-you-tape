// Item facts from the read, the sender's fixes and answers, and the label words.
import { deriveBattery } from "./battery";
import type { BoxItemInput, ItemFacts, RuleEdition } from "./types";

// Present whenever label text was read. It is stored with the other label tags, so label
// identity survives a reload after the label text itself has been left on the laptop.
export const LABEL_TEXT_TAG = "label_text";

// The model's alcohol flag is weak evidence: a small model often says yes to fatty alcohols such
// as cetearyl alcohol. It asks the sender instead of deciding; label words decide.
const FLAG_TAGS = [
  ["liquid", "liquid"],
  ["pressurized", "pressurized"],
  ["alcoholOnLabel", "alcohol_flag"],
  ["flammableOnLabel", "flammable"],
  ["glassContainer", "glass_fragile"],
  ["powder", "powder"],
] as const;

const patternCache = new Map<string, RegExp>();
function wholeWord(pattern: string): RegExp {
  let re = patternCache.get(pattern);
  if (!re) {
    re = new RegExp(`\\b(?:${pattern})\\b`, "i");
    patternCache.set(pattern, re);
  }
  return re;
}

export function labelTagsOf(labelText: string, edition: RuleEdition): string[] {
  if (labelText.trim() === "") return [];
  const tags = new Set<string>([LABEL_TEXT_TAG]);
  for (const w of edition.labelWords) if (wholeWord(w.pattern).test(labelText)) tags.add(w.tag);
  return [...tags].sort();
}

function conditionOf(answer: string | undefined): ItemFacts["condition"] {
  return answer === "new_sealed" || answer === "new_opened" || answer === "used" || answer === "refurbished_certified"
    ? answer
    : "unknown";
}

export function deriveFacts(input: BoxItemInput, edition: RuleEdition): ItemFacts {
  const read = { ...input.read, ...input.overrides };
  const tags = new Set<string>(edition.categoryTags[read.category]);
  for (const [flag, tag] of FLAG_TAGS) if (read[flag]) tags.add(tag);
  for (const t of labelTagsOf(read.labelText, edition)) tags.add(t);
  for (const t of input.labelTags) tags.add(t);
  const tagList = [...tags].sort();

  // Alcohol in the label words or the category wins over a "no". The model's flag alone does not:
  // it leaves alcohol unknown, which asks the sender, and their "no" clears it.
  const answer = input.answers.label_alcohol;
  const alcohol: ItemFacts["alcohol"] = tags.has("alcohol") || answer === "yes" ? "yes" : answer === "no" ? "no" : "unknown";

  let identity: ItemFacts["identity"] = "unconfirmed";
  if (input.identityConfirmedBy) identity = input.identityConfirmedBy;
  else if (read.evidence === "label_read" && tags.has(LABEL_TEXT_TAG)) identity = "label";

  return {
    category: read.category,
    tags: tagList,
    evidence: read.evidence,
    identity,
    battery: deriveBattery(read, input.answers, input.quantity, edition.limits, tagList),
    condition: conditionOf(input.answers.device_condition),
    alcohol,
    quantity: input.quantity,
  };
}
