// The sample box on /judge: nine real items from the published eval photo set (eval-v1). We typed what each
// photo's label says into the same fields a model read fills, leaving out brand, maker and model names, so the
// page needs no camera, no built-in model and no sign-in; the app's own rules engine judges them in the browser.
// A test pins every verdict here to the set's frozen labels for both destinations.
import manifest from "../../eval/set/manifest.json";
import type { SetManifest } from "../eval/loadSet";
import { creditLine } from "../eval/manifest";
import type { ItemRead } from "../shared/itemRead";
import { judgeNameOf } from "./brandFree";

const blank: ItemRead = {
  itemName: "", category: "other", labelText: "", volts: 0, milliampHours: 0, wattHours: 0, lithiumGrams: 0, batteryWords: false,
  liquid: false, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false, glassContainer: false, powder: false,
  retailBox: "cannot_tell", evidence: "label_read",
};

const READS: { itemId: string; read: ItemRead }[] = [
  { itemId: "own-18", read: { ...blank, itemName: "Body lotion", category: "lotion_cream", liquid: true,
    labelText: "24H MOISTURE strawberry dream body lotion 16 FL OZ (473 mL)" } },
  { itemId: "i26", read: { ...blank, itemName: "Whole-bean coffee", category: "coffee",
    labelText: "Handcrafted Coffee Ethiopia 100% Arabica Whole Beans" } },
  { itemId: "i13", read: { ...blank, itemName: "T-shirt", category: "clothing", evidence: "item_seen" } },
  { itemId: "i01", read: { ...blank, itemName: "Power bank", category: "power_bank", labelText: "Power Bank 3.7V 10000mAh 37Wh",
    volts: 3.7, milliampHours: 10000, wattHours: 37, batteryWords: true } },
  { itemId: "own-25", read: { ...blank, itemName: "Perfume", category: "perfume_fragrance", liquid: true, glassContainer: true,
    labelText: "EAU DE PARFUM 100 mL" } },
  { itemId: "i06", read: { ...blank, itemName: "Smartphone", category: "phone", evidence: "item_seen" } },
  { itemId: "i12", read: { ...blank, itemName: "Hand sanitizer", category: "hand_sanitizer", liquid: true, alcoholOnLabel: true,
    labelText: "Peppermint Organic Hand Sanitizer 62% Organic Fair Trade Ethyl Alcohol 2 FL OZ / 59 mL" } },
  { itemId: "i25", read: { ...blank, itemName: "Dark chocolate bar", category: "chocolate", labelText: "85% CACAO RICH DARK" } },
  { itemId: "i20", read: { ...blank, itemName: "Ceramic mug", category: "ceramic", evidence: "item_seen" } },
];

export interface SampleItem { itemId: string; read: ItemRead; photo: string; alt: string; credit: string }

const items = (manifest as SetManifest).items;
export const SAMPLE_BOX: readonly SampleItem[] = READS.map(({ itemId, read }) => {
  const m = items.find((i) => i.itemId === itemId);
  if (!m) throw new Error(`sample item ${itemId} is not in the eval set`);
  return { itemId, read, photo: m.photo, alt: judgeNameOf(itemId), credit: creditLine(m) };
});
