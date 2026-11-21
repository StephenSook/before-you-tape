// The two baselines of eval/PROTOCOL.md, on the same rows as every model path and with no model call.
// Always "Check this": every row is "Check this". Rules only: each item typed as a person would type it from
// the photo (its category and the printed battery numbers, nothing read from the label), entered through the
// app's own add-by-hand path, and judged alone, one item per box, by the rule edition.
import { resolveDestination } from "../engine/edition";
import { labelTagsOf } from "../engine/facts";
import type { RuleEdition } from "../engine/types";
import { evaluateBox } from "../engine/verdict";
import { ITEM_CATEGORIES, type ItemCategory, type ItemRead } from "../shared/itemRead";
import { readFromDraft } from "../ui/AddByHand";
import { draftOf } from "../ui/ReadFields";
import type { SetLabels, SetManifest } from "./loadSet";
import type { EvalItem, EvalRow, EvalRun, EvalSet } from "./types";

// date: the day the rules are applied (it decides which layers are fresh), as on the sender's device.
export interface BaselineMeta { date: string; machine: string; editionId: string }

const runOf = (set: EvalSet, meta: BaselineMeta, name: string, rows: EvalRow[]): EvalRun => ({
  runId: `${name}-${meta.date}`, setId: set.setId, date: meta.date, machine: meta.machine,
  chromeVersion: "none", modelShown: "none", editionId: meta.editionId, rows,
});

export function alwaysCheckRun(set: EvalSet, meta: BaselineMeta): EvalRun {
  const rows = set.items.flatMap((i) => set.destinations.map((destination): EvalRow => ({
    itemId: i.itemId, destination, device: null, cloud: null, shipped: { level: "check", source: "always_check", secondLook: false },
  })));
  return runOf(set, meta, "always_check", rows);
}

export function typedRead(category: ItemCategory, printed: EvalItem["printed"]): ItemRead {
  const draft = draftOf(null);
  const numbers = { ...draft.numbers };
  if (printed) {
    numbers.volts = String(printed.volts);
    numbers.milliampHours = String(printed.milliampHours);
    numbers.wattHours = String(printed.wattHours);
  }
  const read = readFromDraft({ ...draft, category, numbers });
  if (!read) throw new Error(`could not type ${category} with ${JSON.stringify(printed)}`);
  return read;
}

// Every item's typed category, checked against the app's categories; refuses a set with any missing.
export function typedCategoriesOf(labels: SetLabels, manifest: SetManifest): Record<string, ItemCategory> {
  const typed = labels.typed ?? {};
  const missing = manifest.items.map((i) => i.itemId).filter((id) => typed[id] === undefined);
  if (missing.length) throw new Error(`no typed category: ${missing.join(", ")}`);
  const known = new Set<string>(ITEM_CATEGORIES);
  for (const [id, t] of Object.entries(typed)) {
    if (!known.has(t.category)) throw new Error(`${id}: "${t.category}" is not a category`);
  }
  return Object.fromEntries(Object.entries(typed).map(([id, t]) => [id, t.category as ItemCategory]));
}

export function rulesOnlyRun(set: EvalSet, typed: Record<string, ItemCategory>, edition: RuleEdition, meta: BaselineMeta): EvalRun {
  const rows = set.items.flatMap((i) => {
    const category = typed[i.itemId];
    if (!category) throw new Error(`no typed category: ${i.itemId}`);
    const read = typedRead(category, i.printed);
    // As the box store adds a typed item: the sender's own word, no answers, one of it. Alone in its box,
    // because each label is for the item alone, so other items' batteries must not count toward its box.
    const item = {
      itemId: i.itemId, read, overrides: {}, answers: {}, quantity: 1, identityConfirmedBy: "sender" as const,
      labelTags: labelTagsOf(read.labelText, edition),
    };
    return set.destinations.map((destination): EvalRow => {
      const level = evaluateBox([item], edition, resolveDestination(edition, destination, undefined, meta.date), meta.date).items[i.itemId]!.level;
      return { itemId: i.itemId, destination, device: null, cloud: null, shipped: { level, source: "rules_only", secondLook: false } };
    });
  });
  return runOf(set, meta, "rules_only", rows);
}
