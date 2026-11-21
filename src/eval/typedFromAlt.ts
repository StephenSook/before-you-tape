// The typed categories for the rules-only baseline (eval/PROTOCOL.md), derived by a fixed table from each eval
// item's description (its alt text in eval/set/manifest.json), not typed by a person. The first rule that matches
// decides; a test holds that every item matches, that no rule is unused, and that rules which overlap agree.
import { ITEM_CATEGORIES, type ItemCategory } from "../shared/itemRead";

export const ALT_TO_CATEGORY: readonly (readonly [RegExp, ItemCategory])[] = [
  [/power bank/i, "power_bank"],
  // A remover is listed under nail polish: the description starts with it, and no category names removers.
  [/nail polish/i, "nail_polish"],
  [/body lotion/i, "lotion_cream"],
  [/perfume/i, "perfume_fragrance"],
  [/\b(wine|rum|tequila|liqueur)\b/i, "alcohol_drink"],
  [/lithium camera battery|lithium-ion cell/i, "loose_battery"],
  [/\bsmartphone\b/i, "phone"],
  [/\bvape\b|e-cigarette/i, "e_cigarette"],
  [/\baerosol\b/i, "aerosol_spray"],
  [/\blighter\b|\bmatches\b/i, "lighter_matches"],
  [/hand sanitizer/i, "hand_sanitizer"],
  [/t-shirt|sweater|\bsocks\b|\bscarf\b/i, "clothing"],
  [/sneakers/i, "shoes"],
  [/\bbook\b|notebook/i, "book_paper"],
  [/teddy bear|toy car/i, "toy"],
  [/ceramic mug/i, "ceramic"],
  // An empty phone case is neither a phone nor electronics.
  [/phone case/i, "other"],
  [/earphones/i, "earbuds"],
  [/chocolate/i, "chocolate"],
  [/coffee/i, "coffee"],
  [/dried mango/i, "food_packaged"],
];

const KNOWN = new Set<string>(ITEM_CATEGORIES);
for (const [, c] of ALT_TO_CATEGORY) if (!KNOWN.has(c)) throw new Error(`${c} is not a category`);

export function categoryFromAlt(alt: string): ItemCategory {
  const hit = ALT_TO_CATEGORY.find(([pattern]) => pattern.test(alt));
  if (!hit) throw new Error(`no rule for "${alt}"`);
  return hit[1];
}

// The typed block of eval/set/labels.json, in manifest order.
export function typedFromManifest(manifest: { items: { itemId: string; alt: string }[] }): Record<string, { category: ItemCategory }> {
  return Object.fromEntries(manifest.items.map((i) => [i.itemId, { category: categoryFromAlt(i.alt) }]));
}
