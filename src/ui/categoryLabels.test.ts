import { describe, expect, it } from "vitest";
import { ITEM_CATEGORIES } from "../shared/itemRead";
import { CATEGORY_LABELS } from "./categoryLabels";

describe("CATEGORY_LABELS", () => {
  it("names every category in plain words, each name once", () => {
    expect(Object.keys(CATEGORY_LABELS).sort()).toEqual([...ITEM_CATEGORIES].sort());
    const names = Object.values(CATEGORY_LABELS);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).not.toMatch(/_/);
  });
});
