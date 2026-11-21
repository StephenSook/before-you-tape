import { describe, expect, it } from "vitest";
import labels from "../../eval/set/labels.json";
import manifest from "../../eval/set/manifest.json";
import { ALT_TO_CATEGORY, categoryFromAlt, typedFromManifest } from "./typedFromAlt";

describe("the fixed table from item descriptions to typed categories", () => {
  it("gives every eval item exactly one category, from exactly one rule", () => {
    for (const item of manifest.items) {
      const hits = ALT_TO_CATEGORY.filter(([pattern]) => pattern.test(item.alt));
      expect(hits.length, `${item.itemId}: ${item.alt}`).toBeGreaterThan(0);
      // The first rule decides; any later rule that also matches must give the same category, so order never hides a choice.
      expect(new Set(hits.map(([, c]) => c)).size, `${item.itemId}: ${item.alt}`).toBe(1);
    }
  });

  it("has no rule that matches nothing", () => {
    for (const [pattern] of ALT_TO_CATEGORY) {
      expect(manifest.items.some((i) => pattern.test(i.alt)), String(pattern)).toBe(true);
    }
  });

  it("reads the sample items as a person would type them", () => {
    expect(categoryFromAlt("Body lotion, eos shea better, 473 mL")).toBe("lotion_cream");
    expect(categoryFromAlt("Nail polish remover, Walgreens non-acetone")).toBe("nail_polish");
    expect(categoryFromAlt("Empty clear plastic phone case (Motorola G62 cover case), no phone inside")).toBe("other");
    expect(categoryFromAlt("Smartphone (Blackview A60), back view")).toBe("phone");
    expect(() => categoryFromAlt("A thing no rule names")).toThrow(/no rule/);
  });

  it("gives the whole set as labels.json's typed block", () => {
    const typed = typedFromManifest(manifest);
    expect(Object.keys(typed)).toEqual(manifest.items.map((i) => i.itemId));
    expect(typed["own-01"]).toEqual({ category: "power_bank" });
  });

  it("is exactly the typed block recorded in eval/set/labels.json", () => {
    expect((labels as { typed?: unknown }).typed).toEqual(typedFromManifest(manifest));
  });
});
