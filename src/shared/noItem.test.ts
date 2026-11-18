import { describe, expect, it } from "vitest";
import type { ItemRead } from "./itemRead";
import { isNoItem } from "./noItem";

const read = (patch: Partial<ItemRead> = {}): ItemRead => ({
  itemName: "unknown", category: "other", labelText: "", volts: 0, milliampHours: 0, wattHours: 0, lithiumGrams: 0, batteryWords: false,
  liquid: false, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false, glassContainer: false, powder: false,
  retailBox: "cannot_tell", evidence: "not_sure", ...patch,
});

describe("isNoItem", () => {
  it("finds a read of no item: unsure, other, no label, no signal, and no real name", () => {
    for (const itemName of ["unknown", "Unknown item", "", "none", "nothing", "No item", "unclear object", "N/A", "an unknown object"]) {
      expect(isNoItem(read({ itemName })), itemName).toBe(true);
    }
  });

  it("keeps any read that names, reads or notices something", () => {
    expect(isNoItem(read({ itemName: "small box" }))).toBe(false);
    expect(isNoItem(read({ category: "power_bank" }))).toBe(false);
    expect(isNoItem(read({ evidence: "item_seen" }))).toBe(false);
    expect(isNoItem(read({ labelText: "50000mAh" }))).toBe(false);
    expect(isNoItem(read({ liquid: true }))).toBe(false);
    expect(isNoItem(read({ batteryWords: true }))).toBe(false);
    expect(isNoItem(read({ wattHours: 185 }))).toBe(false);
    expect(isNoItem(read({ flammableOnLabel: true }))).toBe(false);
  });
});
