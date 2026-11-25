import { render, screen, within } from "@testing-library/react";
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
const result = evaluateBox(items, ed, resolveDestination(ed, "CA"), "2026-11-25");

describe("BoxSummary", () => {
  it("shows the counts as chips, one per verdict in the box", () => {
    render(<BoxSummary limits={ed.limits} result={result} itemCount={2} recheck={null} />);
    const chips = within(screen.getByTestId("box-summary")).getAllByRole("listitem");
    expect(chips.length).toBeGreaterThan(0);
    for (const c of chips) expect(c.className).toMatch(/\bcount-chip\b/);
    expect(chips.map((c) => c.className.match(/chip-(take_out|check|ok)/)?.[1])).toEqual(
      [result.counts.takeOut > 0 && "take_out", result.counts.check > 0 && "check", result.counts.ok > 0 && "ok"].filter(Boolean));
  });

  it("counts the box by verdict and shows the lithium count", () => {
    render(<BoxSummary limits={ed.limits} result={result} itemCount={3} recheck={null} />);
    const s = screen.getByTestId("box-summary");
    expect(s).toHaveTextContent(`${result.counts.takeOut} to take out`);
    expect(s).toHaveTextContent(`${result.counts.ok} OK to pack`);
    expect(s).toHaveTextContent("Lithium: 1 of 4 cells");
    expect(screen.queryByTestId("recheck-line")).toBeNull();
  });

  it("says one item, not one items", () => {
    render(<BoxSummary limits={ed.limits} result={result} itemCount={1} recheck={{ ms: 2, country: "Canada" }} />);
    expect(screen.getByTestId("recheck-line")).toHaveTextContent("Re-checked 1 item for Canada in 2 ms. 0 model calls.");
  });

  it("says a country change re-checked the box with no model call", () => {
    render(<BoxSummary limits={ed.limits} result={result} itemCount={3} recheck={{ ms: 3, country: "Canada" }} />);
    expect(screen.getByTestId("recheck-line")).toHaveTextContent("Re-checked 3 items for Canada in 3 ms. 0 model calls.");
  });

  it("says the box is empty before anything is added", () => {
    const empty = evaluateBox([], ed, resolveDestination(ed, "CA"), "2026-11-25");
    render(<BoxSummary limits={ed.limits} result={empty} itemCount={0} recheck={null} />);
    expect(screen.getByTestId("box-summary")).toHaveTextContent("Nothing in the box yet.");
  });
});

describe("BoxSummary ready state", () => {
  const shirt = [input("s", { ...base, category: "clothing" })];
  const lotion = [input("l", { ...base, category: "lotion_cream", labelText: "BODY LOTION 8 FL OZ", liquid: true })];
  const summary = (box: BoxItemInput[], code: string) =>
    render(<BoxSummary limits={ed.limits} result={evaluateBox(box, ed, resolveDestination(ed, code), "2026-11-25")} itemCount={box.length} recheck={null} />);

  it("says Ready to tape when every item is OK to pack", () => {
    summary([...shirt, ...lotion], "CA");
    expect(screen.getByTestId("ready-to-tape")).toHaveTextContent("Ready to tape. Everything here is OK to pack.");
  });

  it("never says it while anything is to take out or to check, or for an empty box", () => {
    const { unmount } = summary(lotion, "PH");
    expect(screen.queryByTestId("ready-to-tape")).toBeNull();
    unmount();
    const r = summary([input("p", { ...base, category: "perfume_fragrance", liquid: true })], "CA");
    expect(screen.queryByTestId("ready-to-tape")).toBeNull();
    r.unmount();
    summary([], "CA");
    expect(screen.queryByTestId("ready-to-tape")).toBeNull();
  });

  it("never says it for a country where mail service is suspended", () => {
    summary(shirt, "HT");
    expect(screen.queryByTestId("ready-to-tape")).toBeNull();
  });
});

// A box that may not be the whole saved box (BoxState.incomplete) can hide items, hazards among them.
describe("BoxSummary for a box that may be incomplete", () => {
  const shirt = input("s", { ...base, category: "clothing" });
  const allOk = evaluateBox([shirt], ed, resolveDestination(ed, "CA"), "2026-11-25");

  it("never says Ready to tape or counts the box all clear, and says why instead", () => {
    render(<BoxSummary limits={ed.limits} result={allOk} itemCount={1} recheck={null} incomplete />);
    expect(screen.queryByTestId("ready-to-tape")).toBeNull();
    expect(screen.queryByText(/OK to pack/)).toBeNull();
    expect(screen.getByTestId("box-incomplete")).toHaveTextContent("Can't check the whole box until it syncs.");
  });

  it("still counts what must come out or be checked, and counts lithium only in the items shown", () => {
    render(<BoxSummary limits={ed.limits} result={result} itemCount={3} recheck={null} incomplete />);
    const s = screen.getByTestId("box-summary");
    expect(s).toHaveTextContent(`${result.counts.takeOut} to take out`);
    expect(s).toHaveTextContent("Lithium in the items shown: 1 of 4 cells");
    expect(s).not.toHaveTextContent("OK to pack");
  });

  // Every page starts loading its box; with nothing in it there is no all clear to hold back, so nothing flashes.
  it("says nothing more while there are no items", () => {
    render(<BoxSummary limits={ed.limits} result={evaluateBox([], ed, resolveDestination(ed, "CA"), "2026-11-25")} itemCount={0} recheck={null} incomplete />);
    expect(screen.queryByTestId("box-incomplete")).toBeNull();
  });
});
