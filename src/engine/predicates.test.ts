import { describe, expect, it } from "vitest";
import { matches } from "./predicates";
import type { BatteryFacts, ItemFacts } from "./types";

const battery: BatteryFacts = {
  presence: "none", chemistry: "unknown", volts: null, milliampHours: null, whPrinted: null, whComputed: null,
  whStatus: "none", wh: null, lithiumGrams: null, countAs: "unknown", units: 1, numbersFrom: "read", labelMismatch: null,
};
const f = (patch: Omit<Partial<ItemFacts>, "battery"> & { battery?: Partial<BatteryFacts> }): ItemFacts => ({
  category: "other", tags: [], evidence: "label_read", identity: "label", condition: "unknown", alcohol: "unknown",
  quantity: 1, ...patch, battery: { ...battery, ...patch.battery },
});

describe("matches", () => {
  it("reads nested facts and is false for null or missing", () => {
    expect(matches({ fact: "battery.presence", op: "eq", value: "loose" }, f({ battery: { presence: "loose" } }))).toBe(true);
    expect(matches({ fact: "tags", op: "has", value: "alcohol" }, f({ tags: ["alcohol"] }))).toBe(true);
    expect(matches({ fact: "battery.wh", op: "gt", value: 20 }, f({ battery: { wh: null } }))).toBe(false);
    expect(matches({ fact: "battery.nothing", op: "eq", value: "x" }, f({}))).toBe(false);
    expect(matches({ fact: "nothing.deeper", op: "eq", value: "x" }, f({}))).toBe(false);
  });

  it("supports in, gt, lte and the combinators", () => {
    const x = f({ category: "phone", battery: { wh: 18.5 } });
    expect(matches({ fact: "category", op: "in", value: ["phone", "tablet"] }, x)).toBe(true);
    expect(matches({ fact: "battery.wh", op: "gt", value: 20 }, x)).toBe(false);
    expect(matches({ fact: "battery.wh", op: "lte", value: 20 }, x)).toBe(true);
    expect(matches({ all: [{ fact: "category", op: "eq", value: "phone" }, { fact: "battery.wh", op: "gt", value: 10 }] }, x)).toBe(true);
    expect(matches({ any: [{ fact: "category", op: "eq", value: "laptop" }, { fact: "battery.wh", op: "gt", value: 10 }] }, x)).toBe(true);
    expect(matches({ not: { fact: "category", op: "eq", value: "phone" } }, x)).toBe(false);
  });

  it("never treats has on a non-list or gt on a non-number as true", () => {
    expect(matches({ fact: "category", op: "has", value: "phone" }, f({ category: "phone" }))).toBe(false);
    expect(matches({ fact: "category", op: "gt", value: 1 }, f({ category: "phone" }))).toBe(false);
  });
});
