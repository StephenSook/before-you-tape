// The set file the private blind check loads (public/eval/sets/<setId>.json): each item's photo, alt text
// and credit, in a fixed shuffled order so the hazard items are not grouped, and nothing about the answers.
// Regenerate with `npx tsx scripts/eval-blind-set.ts`; a test fails if the published file drifts.
import type { BlindItem } from "../pages/BlindPage";
import type { BlindSet } from "../pages/BlindRoute";
import type { SetManifest } from "./loadSet";
import { creditLine } from "./manifest";
import { seeded } from "./metrics";

// FNV-1a, so the order depends only on the set id.
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

export function blindSetOf(manifest: SetManifest): BlindSet {
  const items: BlindItem[] = manifest.items.map((m) => ({ itemId: m.itemId, photo: m.photo, alt: m.alt, credit: creditLine(m) }));
  const rand = seeded(hash32(manifest.setId));
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return { setId: manifest.setId, destinations: manifest.destinations, items };
}
