// The server keeps no label text, so a saved item's tags stand in for its label. Tags that older label words made
// can miss a word the current ones find (revision 4 added replica munitions, for one), and judging them as they are
// would let that item through. So each item keeps the version of the label words that made its tags, and an item
// whose tags came from a label under other words is held at "Check this" until its label is photographed or typed
// again. The iPhone app does the same with the edition id.
import { LABEL_TEXT_TAG } from "../engine/facts";
import type { BoxItemInput, RuleEdition, RuleHit } from "../engine/types";
import type { BoxResult } from "../engine/verdict";

export const LABEL_AGAIN = "The rules changed since this label was read. Photograph or type the label again.";
export const LABEL_UNKNOWN = "An earlier version of this app saved this item. Photograph or type the label again.";
export const LITHIUM_WAITS = "Another item in this box needs its label read again before the lithium total is known.";
export const LITHIUM_BOX_WAITS = "An item in this box needs its label read again before the lithium total is known.";
const RULES_PAGE = "https://before-you-tape-2026.web.app/rules";

const versions = new WeakMap<RuleEdition, string>();

// FNV-1a over the label words as JSON: a short, stable name for them, the same on every device.
export function labelWordsVersion(edition: RuleEdition): string {
  const known = versions.get(edition);
  if (known !== undefined) return known;
  let h = 0x811c9dc5;
  const text = JSON.stringify(edition.labelWords);
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  const v = h.toString(16).padStart(8, "0");
  versions.set(edition, v);
  return v;
}

type Versioned = BoxItemInput & { tagsVersion?: string };

// Its tags came from a label (they hold label_text), other words made them, and the sender has not typed it again.
export function tagsAreStale(item: Versioned, version: string): boolean {
  return item.labelTags.includes(LABEL_TEXT_TAG) && item.overrides.labelText === undefined && item.tagsVersion !== version;
}

// Never lowers a verdict: only an "OK to pack" is held, as the iPhone app does.
export function guardStaleTags(result: BoxResult, items: readonly Versioned[], version: string): BoxResult {
  const stale = items.filter((i) => tagsAreStale(i, version));
  if (!stale.length) return result;
  const out: BoxResult = { ...result, items: { ...result.items }, counts: { ...result.counts }, lithium: { ...result.lithium } };
  const hold = (id: string, text: string) => {
    const v = out.items[id];
    if (!v || v.level !== "ok") return;
    const hit: RuleHit = { ruleId: "DATA-LABEL-AGAIN", layer: "data", level: "check", text, section: "Before You Tape: reading check", url: RULES_PAGE };
    out.items[id] = { ...v, level: "check", headline: "Check this", hits: [hit, ...v.hits] };
    out.counts.ok -= 1;
    out.counts.check += 1;
  };
  for (const i of stale) hold(i.itemId, i.tagsVersion === undefined ? LABEL_UNKNOWN : LABEL_AGAIN);
  // The lithium total is box-wide, and an item read again may add to it: no lithium item is OK on it meanwhile.
  if (out.lithium.status === "ok" || out.lithium.status === "none") {
    out.lithium = { ...out.lithium, status: "depends", text: LITHIUM_BOX_WAITS };
    for (const id of out.lithium.itemIds) hold(id, LITHIUM_WAITS);
  }
  return out;
}
