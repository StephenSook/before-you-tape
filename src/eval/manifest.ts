// Checks on the frozen eval set: the item count, ids, photo hashes, a label for every destination, and
// where each photo came from. A photo is either under an open license (CC0, public domain, CC BY or
// CC BY-SA) with its source page and author, or one of the project owner's own photos, which is never
// labelled with an open license.
import type { EvalItem, EvalSet } from "./types";

export const OWN_PHOTO_LICENSE = "own photo (owner-provided for this project)";
const OPEN_LICENSE = /^(CC0 1\.0|Public domain|CC BY \d\.\d|CC BY-SA \d\.\d)$/;

const isOwn = (i: EvalItem) => i.provenance.license === OWN_PHOTO_LICENSE;

export function setProblems(set: EvalSet, expectedItems: number): string[] {
  const out: string[] = [];
  if (set.items.length !== expectedItems) out.push(`expected ${expectedItems} items, found ${set.items.length}`);
  const seen = new Set<string>();
  for (const i of set.items) {
    if (seen.has(i.itemId)) out.push(`${i.itemId}: repeated item id`);
    seen.add(i.itemId);
    if (!/^[0-9a-f]{64}$/.test(i.photoSha256)) out.push(`${i.itemId}: photoSha256 is not a SHA-256`);
    for (const d of set.destinations) if (!i.truth[d]?.section) out.push(`${i.itemId}: no label for ${d}`);
    // A hazard item is one whose label is not OK to pack for at least one destination.
    const notOk = set.destinations.some((d) => i.truth[d] && i.truth[d].expected !== "ok");
    if (i.hazard && !notOk) out.push(`${i.itemId}: hazard must be false: every destination's label is OK to pack`);
    if (!i.hazard && notOk) out.push(`${i.itemId}: hazard must be true: a destination's label is not OK to pack`);
    const p = i.provenance;
    if (!p.changes?.trim()) out.push(`${i.itemId}: provenance needs changes (how the published copy differs from the original)`);
    if (isOwn(i)) {
      if (!p.author.trim()) out.push(`${i.itemId}: an owner's photo needs its author`);
    } else if (/project owner/i.test(p.author)) {
      out.push(`${i.itemId}: the project owner's photo must carry the own-photo license, not an open one`);
    } else if (!OPEN_LICENSE.test(p.license)) {
      out.push(`${i.itemId}: license "${p.license}" is not allowed`);
    } else if (!p.sourcePage.trim() || !p.author.trim() || !/^https:\/\//.test(p.licenseUrl)) {
      out.push(`${i.itemId}: provenance needs sourcePage, author and an https licenseUrl`);
    }
  }
  return out;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function creditLine(i: EvalItem): string {
  if (isOwn(i)) return "Photo by the project owner";
  return `Photo: ${i.provenance.author}, ${i.provenance.license}, ${hostOf(i.provenance.sourcePage)} (${i.provenance.changes})`;
}
