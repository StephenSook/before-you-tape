import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ed } from "../../tests/engine/helpers";
import { resolveDestination } from "../engine/edition";
import { labelTagsOf } from "../engine/facts";
import { evaluateBox } from "../engine/verdict";
import { BRANDS, brandWord } from "./brands.fixture";
import { SAMPLE_BOX } from "./sampleBox";

// The answers a sender gives on the page. The perfume's label does not print "alcohol", so the engine asks;
// the bottle lists it, so the answer is yes.
const ANSWERS: Record<string, Record<string, string>> = { "own-25": { label_alcohol: "yes" } };
const labels = JSON.parse(readFileSync("eval/set/labels.json", "utf8")) as { items: Record<string, Record<string, { expected: string }>> };

describe("the sample box", () => {
  it("is nine real items from the eval set, each with its photo and credit", () => {
    expect(SAMPLE_BOX.map((s) => s.itemId)).toEqual(["own-18", "i26", "i13", "i01", "own-25", "i06", "i12", "i25", "i20"]);
    for (const s of SAMPLE_BOX) {
      expect(s.photo).toBe(`/eval/items/${s.itemId}.jpg`);
      expect(s.credit).toMatch(/^Photo/);
    }
  });

  // The label words keep what the rules read (sizes, alcohol, battery figures) and leave out brand, maker and model.
  it("types no brand, maker or model into a label or an item name", () => {
    for (const s of SAMPLE_BOX) {
      for (const b of BRANDS) {
        expect(brandWord(b).test(s.read.labelText), `${s.itemId} label names ${b}`).toBe(false);
        expect(brandWord(b).test(s.read.itemName), `${s.itemId} name names ${b}`).toBe(false);
      }
    }
  });

  // Built the way the page builds them: the label words become tags, as a typed item's do in the store.
  it("gets the label's verdict for every item and both destinations, once the sender answers", () => {
    for (const code of ["CA", "PH"]) {
      const items = SAMPLE_BOX.map((s) => ({ itemId: s.itemId, read: s.read, overrides: {}, answers: ANSWERS[s.itemId] ?? {}, quantity: 1,
        identityConfirmedBy: "sender" as const, labelTags: labelTagsOf(s.read.labelText, ed) }));
      const r = evaluateBox(items, ed, resolveDestination(ed, code), "2026-11-25");
      for (const s of SAMPLE_BOX) expect(r.items[s.itemId]?.level, `${s.itemId} ${code}`).toBe(labels.items[s.itemId]![code]!.expected);
    }
  });
});
