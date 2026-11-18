// Probes from the two second-model reviews, kept as named vectors so each fix stays pinned:
// items that must never reach "OK to pack", and harmless items that must never be taken out.
import { describe, expect, it } from "vitest";
import guards from "../../tests/vectors/box-guards.json";
import { ed } from "../../tests/engine/helpers";
import type { ItemRead } from "../shared/itemRead";
import { resolveDestination } from "./edition";
import type { BoxItemInput } from "./types";
import { evaluateBox } from "./verdict";

const baseRead: ItemRead = {
  itemName: "Item", category: "other", labelText: "", volts: 0, milliampHours: 0, wattHours: 0, lithiumGrams: 0,
  batteryWords: false, liquid: false, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false,
  glassContainer: false, powder: false, retailBox: "cannot_tell", evidence: "label_read",
};
interface Guard {
  name: string; source: string; code: string; today: string;
  items: Array<Partial<Omit<BoxItemInput, "read">> & { itemId: string; read: Partial<ItemRead> }>;
  expect: Record<string, string>; expectRules?: Record<string, string[]>; notRules?: Record<string, string[]>;
  expectQuestion?: Record<string, string>;
}

describe("review guard vectors", () => {
  it("gives the expected verdict for every guard vector", () => {
    const all = guards as unknown as Guard[];
    expect(all.length).toBeGreaterThanOrEqual(2);
    for (const g of all) {
      // Every vector pins a verdict for every item it lists, so none can pass while asserting nothing.
      expect(Object.keys(g.expect).sort(), `${g.name} must pin a verdict for each item`).toEqual(g.items.map((i) => i.itemId).sort());
      const items: BoxItemInput[] = g.items.map((i) => ({
        overrides: {}, answers: {}, quantity: 1, identityConfirmedBy: null, labelTags: [], ...i, read: { ...baseRead, ...i.read },
      }));
      const r = evaluateBox(items, ed, resolveDestination(ed, g.code), g.today);
      for (const [id, level] of Object.entries(g.expect)) expect(r.items[id]?.level, `${g.name} ${id}`).toBe(level);
      for (const [id, ids] of Object.entries(g.expectRules ?? {})) {
        expect(r.items[id]?.hits.map((h) => h.ruleId), `${g.name} ${id}`).toEqual(expect.arrayContaining(ids));
      }
      for (const [id, ids] of Object.entries(g.notRules ?? {})) {
        for (const ruleId of ids) expect(r.items[id]?.hits.map((h) => h.ruleId), `${g.name} ${id}`).not.toContain(ruleId);
      }
      for (const [id, q] of Object.entries(g.expectQuestion ?? {})) expect(r.items[id]?.question?.id, `${g.name} ${id}`).toBe(q);
    }
  });
});
