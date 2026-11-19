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
    const onFix = vi.fn();
    render(<ItemCard item={phoneNoWh} verdict={noWh} crop={null} onFix={onFix} />);
    await userEvent.click(screen.getByRole("button", { name: "Type the rating" }));
    const fix = screen.getByTestId("fix-reading").closest("details");
    expect(fix?.open).toBe(true);
    expect(screen.getByLabelText("Watt-hours (Wh)")).toHaveFocus();
    await userEvent.type(screen.getByLabelText("Watt-hours (Wh)"), "15.4");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onFix).toHaveBeenCalledWith("ph", { wattHours: 15.4 });
    expect(screen.queryByTestId("crop-image")).toBeNull();
  });

  it("keeps the fix form in a closed Fix this reading disclosure, on what the sender sees now", () => {
    render(<ItemCard item={{ ...perfume, overrides: { itemName: "Eau de parfum" } }} verdict={takeOut} crop={jpeg} onFix={() => {}} />);
    const fix = screen.getByTestId("fix-reading").closest("details");
    expect(fix?.open).toBe(false);
    expect(within(fix as HTMLElement).getByText("Fix this reading")).toBeInTheDocument();
    expect(within(fix as HTMLElement).getByLabelText("Name")).toHaveValue("Eau de parfum");
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

  it("says when the cloud is checking again, and shows the second look's reason once it is done", () => {
    const { rerender } = render(<ItemCard item={shirtSeen} verdict={identityCheck} crop={null} checking />);
    expect(screen.getByRole("status")).toHaveTextContent("Checking again in the cloud.");
    const looked = { ...shirtSeen, secondLook: { ms: 900, reason: "The first read could not confirm what this is, so the cloud looked again." } };
    rerender(<ItemCard item={looked} verdict={verdictFor(looked)} crop={null} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByTestId("second-look")).toHaveTextContent("The first read could not confirm what this is, so the cloud looked again.");
  });

  it("shows a second-look failure with Try again, and the verdict stays", async () => {
    const onRetry = vi.fn();
    render(<ItemCard item={shirtSeen} verdict={identityCheck} crop={null} error="No connection. This check will run when you are back online." onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No connection. This check will run when you are back online.");
    expect(screen.getByTestId("verdict-chip")).toHaveTextContent("Check this");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledWith("s");
  });

  it("marks the newest card, so a phone can keep its verdict in view", () => {
    const { rerender } = render(<ItemCard item={perfume} verdict={takeOut} crop={null} newest />);
    expect(screen.getByTestId("item-card")).toHaveClass("newest");
    rerender(<ItemCard item={perfume} verdict={takeOut} crop={null} />);
    expect(screen.getByTestId("item-card")).not.toHaveClass("newest");
  });

  it("shows both readings of each fact the two reads disagree on, and settles one with one tap", async () => {
    const disputed = item("d", { ...base, itemName: "Phone", category: "phone", labelText: "LI-ION 3.7V 5000mAh 18.5Wh", volts: 3.7,
      milliampHours: 5000, wattHours: 18.5, batteryWords: true }, {
      disputes: {
        category: { device: "power_bank", cloud: "phone", resolved: false },
        battery: { device: { volts: 3.7, milliampHours: 5000, wattHours: 18.5 }, cloud: { volts: 0, milliampHours: 0, wattHours: 0 }, resolved: false },
        lithiumGrams: { device: 2.5, cloud: 0, resolved: false },
        labelTags: { device: ["flammable", "label_text"], cloud: ["label_text"], resolved: false },
        retailBox: { device: "open_or_none", cloud: "sealed", resolved: false },
        liquid: { device: true, cloud: false, resolved: true },
        evidence: { device: "not_sure", cloud: "label_read", resolved: false },
      },
    });
    const v = verdictFor(disputed);
    expect(v.level).toBe("check");
    const onSettle = vi.fn();
    render(<ItemCard item={disputed} verdict={v} crop={null} onSettle={onSettle} />);
    const box = screen.getByRole("group", { name: "The two reads disagree. Pick what the item shows." });
    const row = (name: string) => within(within(box).getByRole("group", { name }));
    expect(row("What it is").getByRole("button", { name: "First read: Power bank" })).toBeInTheDocument();
    expect(row("What it is").getByRole("button", { name: "Second look: Phone" })).toBeInTheDocument();
    expect(row("Battery numbers").getByRole("button", { name: "First read: 3.7 V, 5000 mAh, 18.5 Wh" })).toBeInTheDocument();
    // A zero or empty reading says only that nothing was read, never that nothing is there.
    expect(row("Battery numbers").getByRole("button", { name: "Second look: No numbers read" })).toBeInTheDocument();
    expect(row("Lithium metal").getByRole("button", { name: "First read: 2.5 g lithium" })).toBeInTheDocument();
    expect(row("Lithium metal").getByRole("button", { name: "Second look: No lithium amount read" })).toBeInTheDocument();
    expect(row("Label words").getByRole("button", { name: "First read: flammable" })).toBeInTheDocument();
    expect(row("Label words").getByRole("button", { name: "Second look: No warning words read" })).toBeInTheDocument();
    expect(row("Its box").getByRole("button", { name: "First read: Open or no box" })).toBeInTheDocument();
    expect(row("How it was read").getByRole("button", { name: "First read: Not sure what it is" })).toBeInTheDocument();
    expect(row("How it was read").getByRole("button", { name: "Second look: Read its label" })).toBeInTheDocument();
    // A fact the sender already settled is not asked again.
    expect(within(box).queryByRole("group", { name: "Liquid" })).toBeNull();
    await userEvent.click(row("What it is").getByRole("button", { name: "First read: Power bank" }));
    expect(onSettle).toHaveBeenCalledWith("d", "category", "device");
    // Dropping a word the other read saw asks first.
    await userEvent.click(row("Label words").getByRole("button", { name: "Second look: No warning words read" }));
    expect(onSettle).toHaveBeenCalledTimes(1);
    await userEvent.click(row("Label words").getByRole("button", { name: "Yes, use No warning words read" }));
    expect(onSettle).toHaveBeenLastCalledWith("d", "labelTags", "cloud");
  });

  it("asks before a pick drops a lithium amount, battery numbers or a hazard the other read saw, and not otherwise", async () => {
    const disputed = item("f", { ...base, itemName: "Watch", category: "jewelry_watch", labelText: "CR2032", lithiumGrams: 2.5 }, {
      disputes: {
        lithiumGrams: { device: 2.5, cloud: 0, resolved: false },
        battery: { device: { volts: 3, milliampHours: 220, wattHours: 0 }, cloud: { volts: 0, milliampHours: 0, wattHours: 0 }, resolved: false },
        liquid: { device: true, cloud: false, resolved: false },
      },
    });
    const onSettle = vi.fn();
    render(<ItemCard item={disputed} verdict={verdictFor(disputed)} crop={null} onSettle={onSettle} />);
    const row = (name: string) => within(screen.getByRole("group", { name }));
    await userEvent.click(row("Lithium metal").getByRole("button", { name: "Second look: No lithium amount read" }));
    expect(onSettle).not.toHaveBeenCalled();
    expect(row("Lithium metal").getByRole("alert")).toHaveTextContent("The first read saw 2.5 g lithium. Use No lithium amount read only if the item really shows that.");
    await userEvent.click(row("Lithium metal").getByRole("button", { name: "Keep both for now" }));
    expect(row("Lithium metal").queryByRole("alert")).toBeNull();
    await userEvent.click(row("Lithium metal").getByRole("button", { name: "Second look: No lithium amount read" }));
    await userEvent.click(row("Lithium metal").getByRole("button", { name: "Yes, use No lithium amount read" }));
    expect(onSettle).toHaveBeenLastCalledWith("f", "lithiumGrams", "cloud");
    await userEvent.click(row("Battery numbers").getByRole("button", { name: "Second look: No numbers read" }));
    await userEvent.click(row("Liquid").getByRole("button", { name: "Second look: Not seen" }));
    expect(onSettle).toHaveBeenCalledTimes(1);
    // Picking the reading that keeps what was seen needs no question.
    await userEvent.click(row("Liquid").getByRole("button", { name: "First read: Yes" }));
    expect(onSettle).toHaveBeenLastCalledWith("f", "liquid", "device");
  });

  it("asks nothing about the two reads once every disagreement is settled", () => {
    const settled = item("e", { ...base, itemName: "Phone", category: "phone" }, {
      identityConfirmedBy: "sender", disputes: { category: { device: "power_bank", cloud: "phone", resolved: true } },
    });
    render(<ItemCard item={settled} verdict={verdictFor(settled)} crop={null} onSettle={() => {}} />);
    expect(screen.queryByRole("group", { name: "The two reads disagree. Pick what the item shows." })).toBeNull();
  });
});
