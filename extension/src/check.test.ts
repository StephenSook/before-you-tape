import { expect, it } from "vitest";
import { ed } from "../../tests/engine/helpers";
import type { ItemAnswers } from "../../src/engine/types";
import { buyLine, checkOne, toBoxItem, typedRead } from "./check";

const today = ed.suspensions.checkedOn;
const scarf = {
  itemName: "Scarf", category: "clothing" as const, volts: 0, milliampHours: 0, wattHours: 0,
  liquid: false, pressurized: false, alcoholOnLabel: false, batteryWords: false,
};

it("gives a verdict from typed details with no model", () => {
  const read = typedRead({ ...scarf, itemName: "Power bank", category: "power_bank",
    volts: 3.7, milliampHours: 30000, wattHours: 111, batteryWords: true });
  const v = checkOne(toBoxItem(read, { confirmed: true, answers: {}, quantity: 1 }), ed, "CA", today);
  expect(v).toMatchObject({ level: "take_out", headline: "Take it out" });
  expect(v.hits.map((hit) => hit.ruleId)).toContain("USPS-INTL-LI-LOOSE");
  expect(read).toMatchObject({ evidence: "item_seen", retailBox: "cannot_tell", labelText: "" });
});

it("applies the battery watt-hour limit to an installed battery", () => {
  const answers: ItemAnswers = { device_condition: "new_sealed", cell_count: "more_than_one" };
  const checkLaptop = (milliampHours: number, wattHours: number) => checkOne(
    toBoxItem(typedRead({ ...scarf, itemName: "Laptop", category: "laptop",
      volts: 11.1, milliampHours, wattHours, batteryWords: true }), { confirmed: true, answers, quantity: 1 }),
    ed, "CA", today,
  );
  expect(checkLaptop(10000, 111).hits.map((hit) => hit.ruleId)).toContain("USPS-INTL-LI-BATTERY-OVER");
  // Under the limit it is not taken out. Typed numbers can't be told from read ones yet, so it waits at Check this
  // for the battery numbers (USPS-INTL-LI-ONE-READ) rather than reading OK.
  const under = checkLaptop(9000, 99.9);
  expect(under.hits.map((hit) => hit.ruleId)).not.toContain("USPS-INTL-LI-BATTERY-OVER");
  expect(under.hits.map((hit) => hit.ruleId)).toContain("USPS-INTL-LI-ONE-READ");
  expect(under.level).toBe("check");
});

it("an unconfirmed item is never OK", () => {
  expect(checkOne(toBoxItem(typedRead(scarf), { confirmed: false, answers: {}, quantity: 1 }), ed, "CA", today).level).toBe("check");
});

it("changing the country re-checks by rules alone", () => {
  const item = toBoxItem(typedRead(scarf), { confirmed: true, answers: {}, quantity: 1 });
  const dest = (code: string) => checkOne(item, ed, code, today).layers.find((l) => l.id === "destination")?.label;
  expect(dest("CA")).toMatch(/^Canada rules/);
  expect(dest("PH")).toMatch(/^Philippines rules/);
  expect(checkOne(item, ed, "CA", today).service).toBe("Priority Mail International");
});

it("never changes the three verdict words", () => {
  for (const level of ["ok", "check", "take_out"] as const) {
    expect(buyLine(level)).not.toMatch(/approved|safe to mail/i);
  }
});

it("applies the shared engine's scheduled suspension on its start date", () => {
  const edition = {
    ...ed,
    suspensions: { ...ed.suspensions, upcoming: [{ code: "CA", from: today }] },
  };
  const item = toBoxItem(typedRead(scarf), { confirmed: true, answers: {}, quantity: 1 });
  const verdict = checkOne(item, edition, "CA", today);
  expect(verdict.level).toBe("check");
  expect(verdict.hits.some((hit) => hit.ruleId === "DEST-SUSPENDED")).toBe(true);
});
