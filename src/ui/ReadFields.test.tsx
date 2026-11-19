import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ItemRead } from "../shared/itemRead";
import { draftOf, ReadFields } from "./ReadFields";

const BASE: ItemRead = {
  itemName: "", category: "other", labelText: "", volts: 0, milliampHours: 0, wattHours: 0, lithiumGrams: 0, batteryWords: false,
  liquid: false, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false, glassContainer: false, powder: false,
  retailBox: "cannot_tell", evidence: "label_read",
};

describe("ReadFields battery numbers", () => {
  const fields = (read: Partial<ItemRead> | null, focusField?: keyof ItemRead) => {
    const full = read ? ({ ...BASE, ...read } as ItemRead) : null;
    render(<ReadFields draft={draftOf(full)} onChange={() => {}} nameLabel="Name" focusField={focusField} />);
  };
  it("shows volts, mAh, Wh and lithium for a battery item, and not for clothing", () => {
    fields({ category: "phone" });
    expect(screen.getByLabelText("Watt-hours (Wh)")).toBeInTheDocument();
    cleanup();
    fields({ category: "clothing" });
    for (const label of ["Volts (V)", "Milliamp-hours (mAh)", "Watt-hours (Wh)", "Lithium (grams)"]) expect(screen.queryByLabelText(label)).toBeNull();
  });
  it("still shows them when the label mentions a battery, a number is already there, or one is asked for", () => {
    fields({ category: "clothing", batteryWords: true });
    expect(screen.getByLabelText("Volts (V)")).toBeInTheDocument();
    cleanup();
    fields({ category: "toy", wattHours: 5 });
    expect(screen.getByLabelText("Watt-hours (Wh)")).toHaveValue(5);
    cleanup();
    fields({ category: "other" }, "wattHours");
    expect(screen.getByLabelText("Watt-hours (Wh)")).toHaveFocus();
  });
});
