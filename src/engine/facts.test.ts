import { describe, expect, it } from "vitest";
import bundled from "../../rules/edition.json";
import type { ItemRead } from "../shared/itemRead";
import { parseEdition } from "./edition";
import { deriveFacts, labelTagsOf } from "./facts";
import type { BoxItemInput } from "./types";

const ed = parseEdition(bundled);

const base: ItemRead = {
  itemName: "Item", category: "other", labelText: "", volts: 0, milliampHours: 0, wattHours: 0, lithiumGrams: 0,
  batteryWords: false, liquid: false, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false,
  glassContainer: false, powder: false, retailBox: "cannot_tell", evidence: "item_seen",
};
const r = (patch: Partial<ItemRead>): ItemRead => ({ ...base, ...patch });
const facts = (input: Partial<BoxItemInput> & { read: ItemRead }) =>
  deriveFacts({ itemId: "x", overrides: {}, answers: {}, quantity: 1, identityConfirmedBy: null, labelTags: [], ...input }, ed);

describe("labelTagsOf", () => {
  it("matches whole words, any case", () => {
    expect(labelTagsOf("Contains Cocoa", ed)).toContain("chocolate");
    expect(labelTagsOf("CHOCOLATIER", ed)).not.toContain("chocolate");
  });

  it("does not read alcohol-free or non-flammable as hazards", () => {
    expect(labelTagsOf("ALCOHOL-FREE LOTION", ed)).not.toContain("alcohol");
    expect(labelTagsOf("alcohol free formula", ed)).not.toContain("alcohol");
    expect(labelTagsOf("NON-FLAMMABLE", ed)).not.toContain("flammable");
    expect(labelTagsOf("EXTREMELY FLAMMABLE", ed)).toContain("flammable");
  });

  it("does not read fatty alcohols in a lotion as alcohol", () => {
    for (const label of ["WATER, CETEARYL ALCOHOL, GLYCERIN", "Cetyl Alcohol", "stearyl alcohol", "Benzyl Alcohol",
      "BEHENYL ALCOHOL", "Myristyl Alcohol", "Lanolin Alcohol", "Oleyl Alcohol", "Lauryl Alcohol", "Isostearyl Alcohol"]) {
      expect(labelTagsOf(label, ed), label).not.toContain("alcohol");
    }
    expect(labelTagsOf("ALCOHOL DENAT., CETEARYL ALCOHOL", ed)).toContain("alcohol");
    expect(labelTagsOf("SD Alcohol 40-B", ed)).toContain("alcohol");
  });

  it("marks that label text was read, and returns nothing for no text", () => {
    expect(labelTagsOf("LOTION 8 FL OZ", ed)).toContain("label_text");
    expect(labelTagsOf("", ed)).toEqual([]);
  });
});

describe("deriveFacts", () => {
  it("applies overrides", () =>
    expect(facts({ read: r({ category: "other" }), overrides: { category: "perfume_fragrance" } }).category).toBe("perfume_fragrance"));

  it("adds tags from flags and label words", () =>
    expect(facts({ read: r({ category: "other", liquid: true, labelText: "ALCOHOL DENAT. CONTENTS UNDER PRESSURE" }) }).tags)
      .toEqual(expect.arrayContaining(["liquid", "alcohol", "pressurized"])));

  it("adds tags from the category", () =>
    expect(facts({ read: r({ category: "aerosol_spray" }) }).tags).toContain("pressurized"));

  it("finds coin cells and lithium metal words", () => {
    expect(facts({ read: r({ labelText: "CR2032 3V LITHIUM" }) }).tags).toContain("li_metal");
    expect(facts({ read: r({ labelText: "Lithium metal battery inside" }) }).tags).toContain("li_metal");
    expect(facts({ read: r({ category: "battery_toy", labelText: "CR2032 3V LITHIUM" }) }).battery.chemistry).toBe("li_metal");
  });

  it("uses stored label tags when the label text is gone", () =>
    expect(facts({ read: r({ labelText: "" }), labelTags: ["alcohol", "pressurized"] }).tags)
      .toEqual(expect.arrayContaining(["alcohol", "pressurized"])));

  it("reads alcohol from label, then answer", () => {
    expect(facts({ read: r({ alcoholOnLabel: true }) }).alcohol).toBe("yes");
    expect(facts({ read: r({ category: "perfume_fragrance" }) }).alcohol).toBe("unknown");
    expect(facts({ read: r({ category: "perfume_fragrance" }), answers: { label_alcohol: "no" } }).alcohol).toBe("no");
    expect(facts({ read: r({ category: "perfume_fragrance" }), answers: { label_alcohol: "yes" } }).alcohol).toBe("yes");
    expect(facts({ read: r({ category: "perfume_fragrance" }), answers: { label_alcohol: "cannot_tell" } }).alcohol).toBe("unknown");
  });

  it("keeps the stricter reading when the label and the answer disagree on alcohol", () =>
    expect(facts({ read: r({ alcoholOnLabel: true }), answers: { label_alcohol: "no" } }).alcohol).toBe("yes"));

  it("needs independent evidence for identity", () => {
    expect(facts({ read: r({ category: "clothing", evidence: "item_seen" }) }).identity).toBe("unconfirmed");
    expect(facts({ read: r({ evidence: "label_read", labelText: "LOTION 8 FL OZ" }) }).identity).toBe("label");
    expect(facts({ read: r({ evidence: "item_seen" }), identityConfirmedBy: "sender" }).identity).toBe("sender");
    expect(facts({ read: r({ evidence: "item_seen" }), identityConfirmedBy: "second_look" }).identity).toBe("second_look");
  });

  it("keeps label identity after a reload from the stored label tags", () => {
    const first = facts({ read: r({ evidence: "label_read", labelText: "LOTION 8 FL OZ" }) });
    const reloaded = facts({ read: r({ evidence: "label_read", labelText: "" }), labelTags: labelTagsOf("LOTION 8 FL OZ", ed) });
    expect(reloaded.identity).toBe(first.identity);
    expect(facts({ read: r({ evidence: "label_read", labelText: "" }) }).identity).toBe("unconfirmed");
  });

  it("keeps condition unknown until answered", () => {
    expect(facts({ read: r({ category: "phone", retailBox: "sealed" }) }).condition).toBe("unknown");
    expect(facts({ read: r({ category: "phone" }), answers: { device_condition: "used" } }).condition).toBe("used");
  });

  it("carries quantity into the battery facts", () =>
    expect(facts({ read: r({ category: "phone" }), quantity: 2 }).battery.units).toBe(2));
});
