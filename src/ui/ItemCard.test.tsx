import { cleanup, render, screen, within } from "@testing-library/react";
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

  it("says each layer is up to date or not, and never says checked beside not yet checked by a person", () => {
    render(<ItemCard item={perfume} verdict={takeOut} crop={jpeg} />);
    const lines = within(screen.getByTestId("layer-list")).getAllByRole("listitem").map((li) => li.textContent ?? "");
    const dest = lines.find((l) => l.startsWith("Canada rules"));
    expect(dest).toMatch(/^Canada rules: read from the USPS page on \d{4}-\d{2}-\d{2}; not yet checked by a person \(up to date\)$/);
    expect(lines.find((l) => l.startsWith("Service suspensions"))).toMatch(/^Service suspensions \(up to date, \d{4}-\d{2}-\d{2}\)$/);
    expect(lines.join(" ")).not.toMatch(/: checked/);
  });

  it("labels the mail service the verdict is for", () => {
    render(<ItemCard item={perfume} verdict={takeOut} crop={jpeg} />);
    expect(screen.getByTestId("service")).toHaveTextContent("Service: Priority Mail International");
  });

  it("lets the sender say how many there are, and remove the item", async () => {
    const onQuantity = vi.fn();
    const onRemove = vi.fn();
    render(<ItemCard item={{ ...perfume, quantity: 2 }} verdict={takeOut} crop={null} onQuantity={onQuantity} onRemove={onRemove} />);
    const howMany = screen.getByLabelText("How many");
    expect(howMany).toHaveValue(2);
    await userEvent.clear(howMany);
    await userEvent.type(howMany, "3");
    // Saved on leaving the field, not on each key.
    expect(onQuantity).not.toHaveBeenCalled();
    await userEvent.tab();
    expect(onQuantity).toHaveBeenCalledTimes(1);
    expect(onQuantity).toHaveBeenLastCalledWith("p", 3);
    await userEvent.click(screen.getByRole("button", { name: /^Remove / }));
    expect(onRemove).toHaveBeenCalledWith("p");
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

  it("says when an item has not saved yet, and offers to try again", async () => {
    const onRetrySave = vi.fn();
    const { rerender } = render(<ItemCard item={perfume} verdict={takeOut} crop={null} unsaved onRetrySave={onRetrySave} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Not saved yet. This change is only on this device for now.");
    await userEvent.click(screen.getByRole("button", { name: "Try saving again" }));
    expect(onRetrySave).toHaveBeenCalledTimes(1);
    rerender(<ItemCard item={perfume} verdict={takeOut} crop={null} onRetrySave={onRetrySave} />);
    expect(screen.queryByText("Not saved yet. This change is only on this device for now.")).toBeNull();
  });

  it("offers a shortcut to the lithium amount when the verdict needs it", async () => {
    const watch = item("w", { ...base, itemName: "Watch", category: "jewelry_watch", labelText: "CR2032", evidence: "label_read" },
      { answers: { battery_installed: "installed" } });
    const v = verdictFor(watch);
    expect(v.hits.map((h) => h.ruleId)).toContain("USPS-INTL-LI-METAL-UNKNOWN");
    render(<ItemCard item={watch} verdict={v} crop={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Type the lithium amount" }));
    expect(screen.getByLabelText("Lithium (grams)")).toHaveFocus();
  });

  it("marks a count that is not 1 to 99, says why, and puts back the last good count on leaving the field", async () => {
    const onQuantity = vi.fn();
    const shirt = item("q", { ...base, itemName: "Shirt", category: "clothing", evidence: "item_seen" }, { identityConfirmedBy: "sender" });
    render(<ItemCard item={shirt} verdict={verdictFor(shirt)} crop={null} onQuantity={onQuantity} onRemove={() => {}} />);
    const field = screen.getByLabelText("How many");
    await userEvent.clear(field);
    await userEvent.type(field, "100");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("Type a whole number from 1 to 99.");
    // The counts passed on the way (1, then 10) are never saved.
    expect(onQuantity).not.toHaveBeenCalled();
    await userEvent.tab();
    expect(field).toHaveValue(1);
    expect(field).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("Type a whole number from 1 to 99.")).toBeNull();
  });

  it("names the item on its Remove button", () => {
    const shirt = item("r", { ...base, itemName: "Shirt", category: "clothing", evidence: "item_seen" });
    render(<ItemCard item={shirt} verdict={verdictFor(shirt)} crop={null} onRemove={() => {}} />);
    expect(screen.getByRole("button", { name: "Remove Shirt" })).toBeInTheDocument();
  });

  it("links each rule the verdict rests on, once each, inside What we checked", () => {
    render(<ItemCard item={perfume} verdict={takeOut} crop={null} />);
    const checked = within(screen.getByText("What we checked").closest("details")!);
    const unique = [...new Map(takeOut.hits.filter((h) => !h.section.startsWith("Before You Tape: ")).map((h) => [`${h.section}|${h.url}`, h])).values()];
    expect(unique.length).toBeGreaterThan(0);
    const links = checked.getAllByRole("link", { name: /^Rule: / });
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual(unique.map((h) => [`Rule: ${h.section}`, h.url]));
  });

  it("names the app's own checks in What we checked as plain text, never as a rule link", () => {
    expect(identityCheck.hits.map((h) => h.section)).toContain("Before You Tape: identity check");
    render(<ItemCard item={shirtSeen} verdict={identityCheck} crop={null} />);
    const list = screen.getByTestId("rule-list");
    expect(within(list).getByText("Before You Tape: identity check").closest("a")).toBeNull();
    expect(within(list).queryByRole("link", { name: /Before You Tape/ })).toBeNull();
  });

  it("shows the battery numbers the verdict rests on for a battery item, and nothing for a book", () => {
    const phone = item("b1", { ...base, itemName: "Phone", category: "phone", labelText: "3.7V 2000mAh 7.4Wh", volts: 3.7, milliampHours: 2000,
      wattHours: 7.4, batteryWords: true, retailBox: "sealed" }, { answers: { device_condition: "new_sealed", cell_count: "one" } });
    const { unmount } = render(<ItemCard item={phone} verdict={verdictFor(phone)} crop={null} />);
    expect(screen.getByTestId("battery-numbers")).toHaveTextContent("Label read: 3.7 V, 2,000 mAh, 7.4 Wh");
    unmount();
    const typed = { ...phone, overrides: { wattHours: 7.5 } };
    const r2 = render(<ItemCard item={typed} verdict={verdictFor(typed)} crop={null} />);
    expect(screen.getByTestId("battery-numbers")).toHaveTextContent("Typed by you: 3.7 V, 2,000 mAh, 7.5 Wh");
    r2.unmount();
    const coin = item("b2", { ...base, itemName: "Watch", category: "jewelry_watch", labelText: "CR2032", lithiumGrams: 0.1 });
    const r3 = render(<ItemCard item={coin} verdict={verdictFor(coin)} crop={null} />);
    expect(screen.getByTestId("battery-numbers")).toHaveTextContent("Label read: 0.1 g lithium");
    r3.unmount();
    const book = item("b3", { ...base, itemName: "Book", category: "book_paper", evidence: "item_seen" });
    render(<ItemCard item={book} verdict={verdictFor(book)} crop={null} />);
    expect(screen.queryByTestId("battery-numbers")).toBeNull();
  });

  it("does not say the question twice: a reason that only restates it is left out, a reason that adds to it is kept", () => {
    // A phone with no condition answer: its first reason is "Is it new? Answer to finish this check."
    const phone = item("q", { ...base, itemName: "Phone", category: "phone", labelText: "3.85V 4000mAh 15.4Wh", volts: 3.85, milliampHours: 4000,
      wattHours: 15.4, batteryWords: true, retailBox: "sealed" }, { answers: { cell_count: "one" }, identityConfirmedBy: "second_look" });
    const v = verdictFor(phone);
    expect(v.question?.text).toBe("Is it new?");
    expect(v.hits[0]?.text).toBe("Is it new? Answer to finish this check.");
    render(<ItemCard item={phone} verdict={v} crop={jpeg} />);
    expect(screen.queryByText("Is it new? Answer to finish this check.")).toBeNull();
    expect(screen.getAllByText("Is it new?")).toHaveLength(1);
    cleanup();
    // A reason that says more than the question stays.
    const saysMore = { ...v, hits: [{ ...v.hits[0]!, text: "We read \"alcohol\" and \"free\" on two lines. Does the label say alcohol-free?" }], question: { ...v.question!, text: "Does the label say alcohol-free?" } };
    render(<ItemCard item={phone} verdict={saysMore} crop={jpeg} />);
    expect(screen.getByText(/We read "alcohol" and "free" on two lines/)).toBeInTheDocument();
  });

  describe("the number printed on the label", () => {
    const heldPhone = item("lp", { ...base, itemName: "Phone", category: "phone", labelText: "3.85V 4000mAh 15.4Wh", volts: 3.85, milliampHours: 4000,
      wattHours: 15.4, batteryWords: true, retailBox: "sealed" }, { answers: { device_condition: "new_sealed", cell_count: "one" } });

    it("asks a held item for the Wh on its label in an empty field, and sends what the sender types", async () => {
      const onConfirmNumber = vi.fn();
      render(<ItemCard item={heldPhone} verdict={verdictFor(heldPhone)} crop={null} onConfirmNumber={onConfirmNumber} />);
      const field = screen.getByLabelText("Type the Wh printed on the label");
      expect(field).toHaveValue("");
      await userEvent.type(field, "15.4");
      await userEvent.click(screen.getByRole("button", { name: "Check the number" }));
      expect(onConfirmNumber).toHaveBeenCalledWith("lp", "wattHours", 15.4);
    });

    it("asks for the lithium grams on a lithium metal cell with no Wh", () => {
      const coin = item("lc", { ...base, itemName: "Toy", category: "battery_toy", labelText: "CR2032 LITHIUM", volts: 3, lithiumGrams: 0.1, batteryWords: true,
        retailBox: "sealed" }, { answers: { device_condition: "new_sealed" } });
      render(<ItemCard item={coin} verdict={verdictFor(coin)} crop={null} onConfirmNumber={() => {}} />);
      expect(screen.getByLabelText("Type the lithium grams printed on the label")).toHaveValue("");
    });

    it("asks nothing when the numbers are not held", () => {
      const typed = { ...heldPhone, numbersFrom: "typed" as const };
      render(<ItemCard item={typed} verdict={verdictFor(typed)} crop={null} onConfirmNumber={() => {}} />);
      expect(screen.queryByLabelText("Type the Wh printed on the label")).toBeNull();
    });

    it("sends nothing until a number above zero is typed", async () => {
      const onConfirmNumber = vi.fn();
      render(<ItemCard item={heldPhone} verdict={verdictFor(heldPhone)} crop={null} onConfirmNumber={onConfirmNumber} />);
      expect(screen.getByRole("button", { name: "Check the number" })).toBeDisabled();
      await userEvent.type(screen.getByLabelText("Type the Wh printed on the label"), "0");
      expect(screen.getByRole("button", { name: "Check the number" })).toBeDisabled();
    });
  });
});

