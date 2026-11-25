import { describe, expect, it } from "vitest";
import manifest from "../../eval/set/manifest.json";
import { JUDGE_NAMES, judgeNameOf } from "./brandFree";

// Every brand, maker or model the eval photos' own descriptions name. The measured set keeps its descriptions;
// /judge shows none of these names.
const BRANDS = ["eos", "shea better", "Sally Hansen", "OPI", "Walgreens", "Palmer", "Shams", "Bellavita", "Honey Oud", "Burberry",
  "Rancho La Gloria", "Malibu", "818", "Pineng", "PN-963", "Voltcraft", "PB-16", "JETech", "Varta", "Blackview", "A60", "Lost Vape",
  "Ursa", "Hardcast", "Axe", "BIC", "Bronner", "Hanes", "Beefy", "Bjorn Borg", "Converse", "Jack Purcell", "AIP", "Norcom", "Polo",
  "Ralph Lauren", "Motorola", "G62", "Lindt", "Excellence", "Bellarom", "Forest Feast", "Preda"];

describe("brand-free names for /judge", () => {
  it("names every photo in the eval set", () => {
    expect(Object.keys(JUDGE_NAMES).sort()).toEqual(manifest.items.map((i) => i.itemId).sort());
  });

  // Whole words only, so "Arabica" is not the lighter brand.
  const word = (b: string) => new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");

  it("names no brand, maker or model", () => {
    for (const [id, name] of Object.entries(JUDGE_NAMES)) {
      for (const b of BRANDS) expect(word(b).test(name), `${id}: "${name}" names ${b}`).toBe(false);
    }
  });

  // The list above must be the photos' own words, so a brand that only the list knows cannot make the check pass.
  it("lists only brands that some photo's own description names", () => {
    const alts = manifest.items.map((i) => i.alt).join("\n");
    for (const b of BRANDS) expect(word(b).test(alts), b).toBe(true);
  });

  it("falls back to the item id for a photo it does not know", () => {
    expect(judgeNameOf("own-18")).toBe("Body lotion, 473 mL");
    expect(judgeNameOf("zz-99")).toBe("zz-99");
  });
});
