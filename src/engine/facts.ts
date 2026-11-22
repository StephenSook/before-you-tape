// Item facts from the read, the sender's fixes and answers, and the label words.
import { BATTERY_NUMBER_FIELDS, deriveBattery, labelFiguresOf, type BatteryNumberField, type LabelFigures } from "./battery";
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

// "ALCOHOL" at the end of a line with "FREE" starting the next: the label may say alcohol-free, or
// the next line may be "FREE SHIPPING". The sender's answer to label_alcohol_free decides it.
export const ALCOHOL_FREE_UNSURE_TAG = "alcohol_free_unsure";

// Tags this file adds on its own, beside the edition's category tags and label words.
export const ENGINE_TAGS: readonly string[] = [LABEL_TEXT_TAG, ALCOHOL_FREE_UNSURE_TAG, ...FLAG_TAGS.map(([, tag]) => tag)];

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
// before it on the same line, or by "free" just after it on the same line ("alcohol-free", "mercury
// free") or after a hyphen that ends the line ("ALCOHOL-" then "FREE"). A plain line break before
// "FREE" never negates, because the next line may be "FREE SHIPPING". "Free from" and "free of"
// after a word negate what follows them, not the word before.
const NEGATED_BEFORE = / ?(?:\b(?:no|non|not|without|zero|free of|free from) ?-? ?|\b0(?:\.0+)? ?% ?)$/i;
const NEGATED_AFTER = /^ ?(?:-? ?|- ?\n ?)free\b(?! (?:from|of)\b)/i;
const FREE_AFTER_BREAK = /^\n ?-? ?free\b(?! (?:from|of)\b)/i;

// A word broken across two lines with a hyphen ("FLAM-" then "MABLE"), joined back into one word.
const LINE_END_HYPHEN = /(\p{L})-\n(?=\p{L})/gu;

export function labelTagsOf(labelText: string, edition: RuleEdition): string[] {
  const text = normalizeLabel(labelText);
  if (text === "") return [];
  const tags = new Set<string>([LABEL_TEXT_TAG]);
  addWordTags(text, edition, tags);
  // The text is read a second time with each hyphen wrap joined, so a wrapped hazard word counts. The
  // first read stays: joining only ever adds a word ("SHAMPOO-" then "ALCOHOL" is still alcohol).
  const joined = text.replace(LINE_END_HYPHEN, "$1");
  if (joined !== text) addWordTags(joined, edition, tags);
  return [...tags].sort();
}

function addWordTags(text: string, edition: RuleEdition, tags: Set<string>): void {
  // Matching treats a line break as a space, so a phrase split over two lines still matches. Both
  // negation checks read the text with its line breaks (same length, so the positions agree).
  const matchText = text.replace(/\n/g, " ");
  for (const w of edition.labelWords) {
    if (tags.has(w.tag)) continue;
    let freeAfterBreak = false;
    for (const m of matchText.matchAll(wholeWord(w.pattern))) {
      const before = text.slice(Math.max(0, m.index - 12), m.index);
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 12);
      if (NEGATED_BEFORE.test(before) || NEGATED_AFTER.test(after)) continue;
      if (FREE_AFTER_BREAK.test(after)) {
        freeAfterBreak = true;
        continue;
      }
      tags.add(w.tag);
      break;
    }
    // Only "FREE" on the next line stood against the word. Never negate on that: alcohol becomes a
    // question for the sender, and any other word counts.
    if (freeAfterBreak && !tags.has(w.tag)) tags.add(w.tag === "alcohol" ? ALCOHOL_FREE_UNSURE_TAG : w.tag);
  }
}

function conditionOf(answer: string | undefined): ItemFacts["condition"] {
  return answer === "new_sealed" || answer === "new_opened" || answer === "used" || answer === "refurbished_certified"
    ? answer
    : "unknown";
}

// The battery numbers the sender typed: every one on a typed item, else the ones Fix this reading set.
function typedNumbers(input: BoxItemInput): ReadonlySet<BatteryNumberField> {
  return new Set(BATTERY_NUMBER_FIELDS.filter((f) => input.numbersFrom === "typed" || input.overrides[f] !== undefined));
}

// The label's figures: those kept from the read (or read from its label text), and any in a label the sender typed.
function labelFigures(input: BoxItemInput): LabelFigures {
  const kept = input.labelFigures ?? labelFiguresOf(input.read.labelText);
  const typed = labelFiguresOf(input.overrides.labelText ?? "");
  return { wh: [...kept.wh, ...typed.wh], grams: [...kept.grams, ...typed.grams] };
}

export function deriveFacts(input: BoxItemInput, edition: RuleEdition): ItemFacts {
  const read = { ...input.read, ...input.overrides };
  const tags = new Set<string>(edition.categoryTags[read.category]);
  for (const [flag, tag] of FLAG_TAGS) if (read[flag]) tags.add(tag);
  // A read's label is shown clipped. When its tags were taken from the whole label and sent as labelTags
  // (they hold label_text), those decide and the clipped text is never tagged again: a cut can both drop a
  // word and turn "FLAMMABLE-FREE" into "FLAMMABLE". A client that sends no such tags has its text read.
  const savedTagsCoverLabel = input.overrides.labelText === undefined && input.labelTags.includes(LABEL_TEXT_TAG);
  if (!savedTagsCoverLabel) for (const t of labelTagsOf(read.labelText, edition)) tags.add(t);
  // Saved tags stand in for label text that stayed on the laptop. A label the sender corrected
  // replaces the old label, so the tags saved from the old one no longer apply.
  if (input.overrides.labelText === undefined) for (const t of input.labelTags) tags.add(t);
  // "ALCOHOL" then "FREE" on the next line, and no plain "ALCOHOL" anywhere: the sender says whether
  // the label reads alcohol-free. "No" counts the alcohol; "yes" clears it.
  const freeAnswer = input.answers.label_alcohol_free;
  const freeUnsure = tags.has(ALCOHOL_FREE_UNSURE_TAG) && !tags.has("alcohol");
  if (freeUnsure && freeAnswer === "no") tags.add("alcohol");
  const tagList = [...tags].sort();

  // Alcohol in the label words or the category wins over a "no". The model's flag alone does not:
  // it leaves alcohol unknown, which asks the sender, and their "no" clears it. The sender's own word that
  // the label lists alcohol (a ticked box on a typed item or a fix) settles it like their answer would.
  const answer = input.answers.label_alcohol;
  const senderSaysAlcohol = input.overrides.alcoholOnLabel === true;
  const cleared = answer === "no" || (freeUnsure && freeAnswer === "yes");
  const alcohol: ItemFacts["alcohol"] = tags.has("alcohol") || answer === "yes" || senderSaysAlcohol ? "yes" : cleared ? "no" : "unknown";

  let identity: ItemFacts["identity"] = "unconfirmed";
  if (input.identityConfirmedBy) identity = input.identityConfirmedBy;
  else if (read.evidence === "label_read" && tags.has(LABEL_TEXT_TAG)) identity = "label";
  // A second look stands behind the numbers only when the two reads agreed on them: once they disputed the battery
  // numbers or the lithium grams, settled or not, the numbers are no second look's.
  if (identity === "second_look" && (input.disputes?.battery !== undefined || input.disputes?.lithiumGrams !== undefined)) identity = "sender";

  return {
    category: read.category,
    tags: tagList,
    evidence: read.evidence,
    identity,
    battery: deriveBattery(read, input.answers, input.quantity, edition.limits, tagList, typedNumbers(input), labelFigures(input)),
    // The photo outranks a saved answer: a device seen out of its box is not "still sealed". Fixing
    // the box reading (an override to "sealed") is how the sender clears it.
    condition: conditionOf(input.answers.device_condition) === "new_sealed" && read.retailBox === "open_or_none"
      ? "new_opened"
      : conditionOf(input.answers.device_condition),
    alcohol,
    quantity: input.quantity,
  };
}
