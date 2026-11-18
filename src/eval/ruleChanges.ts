// Engine rule changes made after the eval set was labelled, each prompted by an item in the set. The labels
// themselves were not changed. Every eval report gives two numbers side by side: all items, and the items
// that did not prompt a rule change. From the freeze on, no item may prompt a change: a gap is a miss.
import type { EvalSet } from "./types";

export const RULE_CHANGES_AFTER_LABELLING = [
  { itemId: "i25", commit: "dda2875", change: "chocolate and margarine count as easily liquefiable (PH-P-01)" },
  { itemId: "i20", commit: "877f673", change: "a ceramic category, Check this for the Philippines (PH-P-01)" },
] as const;

export function untouchedItems(set: EvalSet): EvalSet {
  const touched = new Set<string>(RULE_CHANGES_AFTER_LABELLING.map((c) => c.itemId));
  return { ...set, items: set.items.filter((i) => !touched.has(i.itemId)) };
}
