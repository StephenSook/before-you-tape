import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ed } from "../../tests/engine/helpers";
import type { ImagePart } from "../ai/port";
import type { BoxItem } from "../data/boxStore";
import { resolveDestination } from "../engine/edition";
import { labelTagsOf } from "../engine/facts";
import { evaluateBox } from "../engine/verdict";
import type { ItemRead } from "../shared/itemRead";
import { ItemCard } from "./ItemCard";

const base: ItemRead = {
  itemName: "Item", category: "other", labelText: "", volts: 0, milliampHours: 0, wattHours: 0, lithiumGrams: 0,
  batteryWords: false, liquid: false, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false,
  glassContainer: false, powder: false, retailBox: "cannot_tell", evidence: "label_read",
};
const item = (itemId: string, read: ItemRead, patch: Partial<BoxItem> = {}): BoxItem => ({
  itemId, read, overrides: {}, answers: {}, quantity: 1, identityConfirmedBy: null, labelTags: labelTagsOf(read.labelText, ed),
  readSource: "on_device", readMs: 1300, secondLook: null, cropKey: "k",
  customs: { description: "", lintOk: false, weightOz: null, valueUsd: null, countryOfOrigin: null, upc: null }, ...patch,
});
const verdictFor = (i: BoxItem) => {
  const v = evaluateBox([i], ed, resolveDestination(ed, "CA"), "2026-11-20").items[i.itemId];
  if (!v) throw new Error("no verdict");
  return v;
};
const jpeg: ImagePart = { mimeType: "image/jpeg", base64: "/9j/AAAA" };

const perfume = item("p", { ...base, itemName: "Perfume", category: "perfume_fragrance", labelText: "EAU DE PARFUM ALCOHOL DENAT 50 ML", liquid: true });
const takeOut = verdictFor(perfume);
const shirtSeen = item("s", { ...base, itemName: "Shirt", category: "clothing", evidence: "item_seen" });
const identityCheck = verdictFor(shirtSeen);
const phoneNoWh = item("ph", { ...base, itemName: "Phone", category: "phone", labelText: "LI-ION BATTERY", batteryWords: true, retailBox: "sealed" },
  { answers: { device_condition: "new_sealed", battery_installed: "installed" } });
const noWh = verdictFor(phoneNoWh);

describe("ItemCard", () => {
  it("shows the crop, the first reason, the source and the four layers", () => {
    expect(takeOut.level).toBe("take_out");
    render(<ItemCard item={perfume} verdict={takeOut} crop={jpeg} />);
    expect(screen.getByTestId("crop-image")).toHaveAttribute("src", expect.stringMatching(/^data:image\/jpeg/));
    expect(screen.getByText(takeOut.hits[0]!.text)).toBeInTheDocument();
    expect(screen.getByTestId("source-glyph")).toHaveAccessibleName("Read on this laptop");
    expect(within(screen.getByTestId("layer-list")).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByTestId("verdict-chip")).toHaveTextContent("Take it out");
  });

  it("keeps the layer list in a closed What we checked disclosure", () => {
    render(<ItemCard item={perfume} verdict={takeOut} crop={jpeg} />);
    const details = screen.getByTestId("layer-list").closest("details");
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(within(details as HTMLElement).getByText("What we checked")).toBeInTheDocument();
  });

  it("asks the sender to confirm an item with no label", async () => {
    expect(identityCheck.hits.some((h) => h.ruleId === "DATA-IDENTITY")).toBe(true);
    const onConfirm = vi.fn();
    render(<ItemCard item={shirtSeen} verdict={identityCheck} crop={jpeg} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByTestId("confirm-identity"));
    expect(onConfirm).toHaveBeenCalledWith("s");
  });

  it("offers to type the rating when no Wh is printed", async () => {
    expect(noWh.hits.some((h) => h.ruleId === "USPS-INTL-LI-NO-WH")).toBe(true);
    const onTypeRating = vi.fn();
    render(<ItemCard item={phoneNoWh} verdict={noWh} crop={null} onTypeRating={onTypeRating} />);
    await userEvent.click(screen.getByRole("button", { name: "Type the rating" }));
    expect(onTypeRating).toHaveBeenCalledWith("ph");
    expect(screen.queryByTestId("crop-image")).toBeNull();
  });

  it("asks the verdict's question and sends the answer back for this item", async () => {
    const lotion = item("l", { ...base, itemName: "Lotion", category: "lotion_cream", labelText: "ALCOHOL\nFREE LOTION 8 FL OZ" });
    const v = verdictFor(lotion);
    expect(v.question?.id).toBe("label_alcohol_free");
    const onAnswer = vi.fn();
    render(<ItemCard item={lotion} verdict={v} crop={jpeg} onAnswer={onAnswer} />);
    await userEvent.click(within(screen.getByTestId("question-row")).getByRole("button", { name: "Yes, it says alcohol-free" }));
    expect(onAnswer).toHaveBeenCalledWith("l", "label_alcohol_free", "yes");
  });
});
