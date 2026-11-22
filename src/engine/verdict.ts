// The box verdict. Facts, item rules, the destination and the four layers give each
// item its hits; the lithium count runs over the items not already taken out. An item
// is "OK to pack" only when nothing is left to check: its identity has evidence, the
// read is sure, every question is answered, and all four layers are checked and fresh.
import { evaluateDestination } from "./destination";
import { deriveFacts } from "./facts";
import { evaluateItemRules } from "./itemRules";
import { layerStatuses } from "./layers";
import { evaluateLithiumBox, type LithiumBoxResult } from "./lithiumBox";
import { openDisputes, type BoxItemInput, type DestinationContext, type ItemFacts, type ItemVerdict, type RuleEdition, type RuleHit, type VerdictLevel } from "./types";

export interface BoxResult {
  items: Record<string, ItemVerdict>;
  lithium: LithiumBoxResult;
  destination: DestinationContext;
  notes: RuleHit[];
  counts: { ok: number; check: number; takeOut: number };
  editionId: string;
}

const HEADLINE: Record<VerdictLevel, string> = { ok: "OK to pack", check: "Check this", take_out: "Take it out" };
const SEVERITY: Record<RuleHit["level"], number> = { take_out: 2, check: 1, note: 0 };
const RULES_PAGE = "https://before-you-tape-2026.web.app/rules";
const PUB52_LITHIUM = "https://pe.usps.com/text/pub52/pub52c6_005.htm";

const IDENTITY_HIT: RuleHit = {
  ruleId: "DATA-IDENTITY", layer: "data", level: "check", section: "Before You Tape: identity check", url: RULES_PAGE,
  text: "Confirm what this is. We only saw it, so we can't be sure from the picture alone.",
};

// OK precondition 2 lives in code, so no edition can remove it.
const UNSURE_HIT: RuleHit = {
  ruleId: "DATA-UNSURE", layer: "data", level: "check", section: "Before You Tape: reading check", url: RULES_PAGE,
  text: "We're not sure what this is. Fix the reading or type what it is.",
};

// The two reads of a second look disagree on a fact that can change the verdict. Never a silent pick: the
// sender confirms which reading is right. In code, like the hits above, so no edition can remove it.
const DISPUTE_HIT: RuleHit = {
  ruleId: "DATA-DISPUTE", layer: "data", level: "check", section: "Before You Tape: two reads disagree", url: RULES_PAGE,
  text: "The two reads of this item disagree. Choose the reading that matches it.",
};

// A read's label text names a Wh or lithium-grams figure its own number disagrees with. In code, like the hits above.
const shown = (n: number) => String(Math.round(n * 100) / 100);
function labelNumbersHit(m: NonNullable<ItemFacts["battery"]["labelMismatch"]>): RuleHit {
  const source = m.typed ? "the number typed is" : "the read says";
  const said = m.kind === "wh" ? `${shown(m.label)} Wh but ${source} ${shown(m.read)} Wh` : `${shown(m.label)} g of lithium but ${source} ${shown(m.read)} g`;
  return {
    ruleId: "DATA-LABEL-NUMBERS", layer: "data", level: "check", section: "Before You Tape: label and reading disagree", url: RULES_PAGE,
    text: `The label text says ${said}. Type the numbers from the label in Fix this reading.`,
  };
}

const BAD_QUANTITY_HIT: RuleHit = {
  ruleId: "DATA-BAD-QUANTITY", layer: "data", level: "check", section: "Before You Tape: item count", url: RULES_PAGE,
  text: "The count for this item must be a whole number, 1 or more. Fix the count.",
};

function boxHit(edition: RuleEdition, ruleId: string, level: RuleHit["level"], text?: string, askId?: string): RuleHit {
  const rule = edition.rules.find((r) => r.id === ruleId);
  const hit: RuleHit = {
    ruleId, layer: "box", level, text: text ?? rule?.ourWording ?? ruleId,
    section: rule?.section ?? "Pub 52 622.5", url: rule?.url ?? PUB52_LITHIUM,
  };
  if (askId) hit.askId = askId;
  return hit;
}

// settle: drop a question from an item already taken out when no answer to it could change that (an inner
// evaluation, made with each answer in turn, passes false).
export function evaluateBox(items: BoxItemInput[], edition: RuleEdition, dest: DestinationContext, today: string, settle = true): BoxResult {
  const sorted = [...items].sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0));
  const layers = layerStatuses(edition, dest, today);
  const notChecked = layers.filter((l) => l.state !== "checked");
  const layerHit: RuleHit | null = notChecked.length
    ? {
        ruleId: "DATA-LAYER-STALE", layer: "data", level: "check", section: "Before You Tape: rule layers", url: RULES_PAGE,
        text: `Not checked or out of date: ${notChecked.map((l) => l.label).join(", ")}.`,
      }
    : null;

  const perItem = sorted.map((raw) => {
    // A count must be a whole number of 1 or more. Anything else is checked and counted as 1, so a
    // zero, negative or fractional count can never lower the lithium total of the other items.
    const goodQuantity = Number.isInteger(raw.quantity) && raw.quantity >= 1;
    const input = goodQuantity ? raw : { ...raw, quantity: 1 };
    const facts = deriveFacts(input, edition);
    const hits: RuleHit[] = [];
    if (!goodQuantity) hits.push(BAD_QUANTITY_HIT);
    if (openDisputes(raw.disputes).length > 0) hits.push(DISPUTE_HIT);
    if (facts.identity === "unconfirmed") hits.push(IDENTITY_HIT);
    if (facts.evidence === "not_sure" || facts.category === "other") hits.push(UNSURE_HIT);
    if (facts.battery.labelMismatch) hits.push(labelNumbersHit(facts.battery.labelMismatch));
    hits.push(...evaluateItemRules(facts, edition.rules));
    hits.push(...evaluateDestination(facts, input.answers, dest));
    if (layerHit) hits.push(layerHit);
    return { itemId: input.itemId, facts, hits };
  });

  // An item already taken out is not in the box, so it does not count toward the lithium limit.
  const lithium = evaluateLithiumBox(
    perItem.filter((p) => !p.hits.some((h) => h.level === "take_out")).map((p) => ({ itemId: p.itemId, battery: p.facts.battery })),
    edition.limits,
  );
  const counted = new Set(lithium.itemIds);
  const unknown = new Set(lithium.unknownItemIds);
  for (const p of perItem) {
    if (!counted.has(p.itemId)) continue;
    if (lithium.status === "over") p.hits.push(boxHit(edition, "USPS-INTL-LI-BOX-COUNT", "take_out", lithium.text));
    else if (lithium.status === "mixed") p.hits.push(boxHit(edition, "USPS-INTL-LI-BOX-MIXED", edition.limits.mixedOutcome, lithium.text));
    else if (lithium.status === "depends") {
      p.hits.push(boxHit(edition, "USPS-INTL-LI-BOX-COUNT", "check", lithium.text, unknown.has(p.itemId) ? "cell_count" : undefined));
    }
  }
  const notes = lithium.status === "none" ? [] : [
    boxHit(edition, "USPS-INTL-LI-NO-MARKING", "note"),
    boxHit(edition, "USPS-INTL-LI-TWO-BOXES", "note"),
  ];

  const result: Record<string, ItemVerdict> = {};
  const counts = { ok: 0, check: 0, takeOut: 0 };
  for (const p of perItem) {
    const hits = [...p.hits].sort((a, b) => SEVERITY[b.level] - SEVERITY[a.level]);
    const top = hits[0];
    const level: VerdictLevel = top && top.level !== "note" ? top.level : "ok";
    const askId = hits.find((h) => h.askId)?.askId;
    const question = askId ? (edition.questions.find((q) => q.id === askId) ?? null) : null;
    result[p.itemId] = { level, headline: HEADLINE[level], hits, question, layers, service: edition.service };
    if (level === "ok") counts.ok++;
    else if (level === "check") counts.check++;
    else counts.takeOut++;
  }

  if (settle) {
    for (const p of perItem) settleQuestion(p.itemId, p.facts.battery.presence, items, result, edition, dest, today);
  }
  return { items: result, lithium, destination: dest, notes, counts, editionId: edition.editionId };
}

// An item a rule has already taken out is not asked a question when no answer could change anything: some take-out
// hit does not hang on the question, and with every answer the item stays out and every other item keeps its
// verdict. An item with no battery cannot change the box's lithium count, so it is judged alone.
function settleQuestion(itemId: string, presence: string, items: BoxItemInput[], result: Record<string, ItemVerdict>,
  edition: RuleEdition, dest: DestinationContext, today: string): void {
  const v = result[itemId];
  const q = v?.question;
  if (!v || !q || v.level !== "take_out" || q.answers.length === 0) return;
  if (!v.hits.some((h) => h.level === "take_out" && h.askId !== q.id)) return;
  const alone = presence === "none" && q.id !== "battery_installed";
  const pool = alone ? items.filter((i) => i.itemId === itemId) : items;
  const unchanged = q.answers.every((a) => {
    const answered = pool.map((i) => (i.itemId === itemId ? { ...i, answers: { ...i.answers, [q.id]: a.id } } : i));
    const r = evaluateBox(answered, edition, dest, today, false);
    return pool.every((i) => r.items[i.itemId]?.level === (i.itemId === itemId ? "take_out" : result[i.itemId]?.level));
  });
  if (unchanged) result[itemId] = { ...v, hits: v.hits.filter((h) => h.askId !== q.id), question: null };
}
