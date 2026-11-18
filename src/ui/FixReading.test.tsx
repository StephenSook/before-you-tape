import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ItemRead } from "../shared/itemRead";
import { FixReading } from "./FixReading";

const phoneRead: ItemRead = {
  itemName: "Phone", category: "phone", labelText: "LI-ION 3.85V 4000mAh", volts: 3.85, milliampHours: 4000, wattHours: 0, lithiumGrams: 0,
  batteryWords: true, liquid: false, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false, glassContainer: false,
  powder: false, retailBox: "sealed", evidence: "label_read",
};

describe("FixReading", () => {
  it("saves only changed fields", async () => {
    const onSave = vi.fn();
    render(<FixReading read={phoneRead} onSave={onSave} />);
    await userEvent.clear(screen.getByLabelText("Watt-hours (Wh)"));
    await userEvent.type(screen.getByLabelText("Watt-hours (Wh)"), "15.4");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ wattHours: 15.4 });
  });

  it("rejects a negative number", async () => {
    render(<FixReading read={phoneRead} onSave={() => {}} />);
    await userEvent.clear(screen.getByLabelText("Volts (V)"));
    await userEvent.type(screen.getByLabelText("Volts (V)"), "-3");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("reads an empty number as not printed", async () => {
    const onSave = vi.fn();
    render(<FixReading read={phoneRead} onSave={onSave} />);
    await userEvent.clear(screen.getByLabelText("Volts (V)"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ volts: 0 });
  });

  it("saves a changed kind of item, label text and yes-or-no facts", async () => {
    const onSave = vi.fn();
    render(<FixReading read={phoneRead} onSave={onSave} />);
    await userEvent.selectOptions(screen.getByLabelText("What is it?"), "power_bank");
    await userEvent.clear(screen.getByLabelText("Words on the label"));
    await userEvent.type(screen.getByLabelText("Words on the label"), "POWER BANK 10000mAh");
    await userEvent.click(screen.getByLabelText("It is a liquid"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ category: "power_bank", labelText: "POWER BANK 10000mAh", liquid: true });
  });

  it("puts the cursor on the field it was opened for", () => {
    render(<FixReading read={phoneRead} onSave={() => {}} focusField="wattHours" />);
    expect(screen.getByLabelText("Watt-hours (Wh)")).toHaveFocus();
  });
});
