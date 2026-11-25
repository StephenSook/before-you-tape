import { describe, expect, it } from "vitest";
import manifest from "../../eval/set/manifest.json";
import { BRANDS, brandWord } from "./brands.fixture";
import { JUDGE_NAMES, judgeNameOf } from "./brandFree";

describe("brand-free names for /judge", () => {
  it("names every photo in the eval set", () => {
    expect(Object.keys(JUDGE_NAMES).sort()).toEqual(manifest.items.map((i) => i.itemId).sort());
  });

  it("names no brand, maker or model", () => {
    for (const [id, name] of Object.entries(JUDGE_NAMES)) {
      for (const b of BRANDS) expect(brandWord(b).test(name), `${id}: "${name}" names ${b}`).toBe(false);
    }
  });

  // The brand list must be the photos' own words, so a brand that only the list knows cannot make the check pass.
  it("lists only brands that some photo's own description names", () => {
    const alts = manifest.items.map((i) => i.alt).join("\n");
    for (const b of BRANDS) expect(brandWord(b).test(alts), b).toBe(true);
  });

  it("falls back to the item id for a photo it does not know", () => {
    expect(judgeNameOf("own-18")).toBe("Body lotion, 473 mL");
    expect(judgeNameOf("zz-99")).toBe("zz-99");
  });
});
