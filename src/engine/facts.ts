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

// Tags this file adds on its own, beside the edition's category tags and label words.
export const ENGINE_TAGS: readonly string[] = [LABEL_TEXT_TAG, ...FLAG_TAGS.map(([, tag]) => tag)];

const patternCache = new Map<string, RegExp>();
function wholeWord(pattern: string): RegExp {
  let re = patternCache.get(pattern);
  if (!re) {
    re = new RegExp(`\\b(?:${pattern})\\b`, "gi");
    patternCache.set(pattern, re);
  }
  return re;
}

// Labels arrive with no-break spaces and Unicode hyphens; match on one plain form. Line breaks are
// kept, so a word on one line ("FREE FROM PALM OIL") never negates a word on the line above it.
export function normalizeLabel(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/g, "-")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n[\s]*/g, "\n")
    .trim();
}

// A word is negated by "no", "non", "not", "without", "zero", "free of", "free from" or "0%" just
// before it on the same line, or by "free" just after it ("alcohol-free", "mercury free"), even when
// that "free" wraps onto the next line ("ALCOHOL-" then "FREE"). "Free from" and "free of" after a
// word negate what follows them, not the word before.
const NEGATED_BEFORE = / ?(?:\b(?:no|non|not|without|zero|free of|free from) ?-? ?|\b0(?:\.0+)? ?% ?)$/i;
const NEGATED_AFTER = /^ ?-? ?free\b(?! (?:from|of)\b)/i;

export function labelTagsOf(labelText: string, edition: RuleEdition): string[] {
  const text = normalizeLabel(labelText);
  if (text === "") return [];
  // Matching treats a line break as a space, so a phrase split over two lines still matches. The
  // check for a negating word before reads the text with its line breaks, so a "no" ending one line
  // never reaches a word on the next; the check for "-free" after reads breaks as spaces, so a
  // wrapped "ALCOHOL-" / "FREE" still negates. Both texts have the same length, so positions agree.
  const matchText = text.replace(/\n/g, " ");
  const tags = new Set<string>([LABEL_TEXT_TAG]);
  for (const w of edition.labelWords) {
    if (tags.has(w.tag)) continue;
    for (const m of matchText.matchAll(wholeWord(w.pattern))) {
      const before = text.slice(Math.max(0, m.index - 12), m.index);
      const after = matchText.slice(m.index + m[0].length, m.index + m[0].length + 12);
      if (!NEGATED_BEFORE.test(before) && !NEGATED_AFTER.test(after)) {
        tags.add(w.tag);
        break;
      }
    }
  }
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
  // Saved tags stand in for label text that stayed on the laptop. A label the sender corrected
  // replaces the old label, so the tags saved from the old one no longer apply.
  if (input.overrides.labelText === undefined) for (const t of input.labelTags) tags.add(t);
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
    // The photo outranks a saved answer: a device seen out of its box is not "still sealed". Fixing
    // the box reading (an override to "sealed") is how the sender clears it.
    condition: conditionOf(input.answers.device_condition) === "new_sealed" && read.retailBox === "open_or_none"
      ? "new_opened"
      : conditionOf(input.answers.device_condition),
    alcohol,
    quantity: input.quantity,
  };
}
