import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ed } from "../../tests/engine/helpers";
import { resolveDestination } from "../engine/edition";
import type { BoxItemInput } from "../engine/types";
import { evaluateBox } from "../engine/verdict";
import type { ItemRead } from "../shared/itemRead";
import { BoxSummary } from "./BoxSummary";

const base: ItemRead = {
  itemName: "Item", category: "other", labelText: "", volts: 0, milliampHours: 0, wattHours: 0, lithiumGrams: 0,
  batteryWords: false, liquid: false, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false,
  glassContainer: false, powder: false, retailBox: "cannot_tell", evidence: "label_read",
};
const input = (itemId: string, read: ItemRead, patch: Partial<BoxItemInput> = {}): BoxItemInput =>
  ({ itemId, read, overrides: {}, answers: {}, quantity: 1, identityConfirmedBy: "sender", labelTags: [], ...patch });
const items = [
  input("p", { ...base, category: "perfume_fragrance", labelText: "EAU DE PARFUM ALCOHOL DENAT 50 ML", liquid: true }),
  input("s", { ...base, category: "clothing" }),
  input("ph", { ...base, category: "phone", labelText: "LI-ION 3.85V 4000mAh 15.4Wh", volts: 3.85, milliampHours: 4000, wattHours: 15.4, batteryWords: true, retailBox: "sealed" },
    { answers: { device_condition: "new_sealed", battery_installed: "installed", cell_count: "one" } }),
];
const result = evaluateBox(items, ed, resolveDestination(ed, "CA"), "2026-11-20");

describe("BoxSummary", () => {
  it("counts the box by verdict and shows the lithium count", () => {
    render(<BoxSummary limits={ed.limits} result={result} itemCount={3} recheck={null} />);
    const s = screen.getByTestId("box-summary");
    expect(s).toHaveTextContent(`${result.counts.takeOut} to take out`);
    expect(s).toHaveTextContent(`${result.counts.ok} OK to pack`);
    expect(s).toHaveTextContent("Lithium: 1 of 4 cells");
    expect(screen.queryByTestId("recheck-line")).toBeNull();
  });

  it("says a country change re-checked the box with no model call", () => {
    render(<BoxSummary limits={ed.limits} result={result} itemCount={3} recheck={{ ms: 3, country: "Canada" }} />);
    expect(screen.getByTestId("recheck-line")).toHaveTextContent("Re-checked 3 items for Canada in 3 ms. 0 model calls.");
  });

  it("says the box is empty before anything is added", () => {
    const empty = evaluateBox([], ed, resolveDestination(ed, "CA"), "2026-11-20");
    render(<BoxSummary limits={ed.limits} result={empty} itemCount={0} recheck={null} />);
    expect(screen.getByTestId("box-summary")).toHaveTextContent("Nothing in the box yet.");
  });
});
