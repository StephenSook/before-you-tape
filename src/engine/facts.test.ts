import { readFileSync } from "node:fs";
import { join } from "node:path";
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

  it("does not read negated hazard words as hazards", () => {
    const none = (label: string, tag: string) => expect(labelTagsOf(label, ed), label).not.toContain(tag);
    none("BODY LOTION NON FLAMMABLE", "flammable");
    none("NOT FLAMMABLE", "flammable");
    none("TOY CAR MERCURY FREE", "mercury");
    none("0% MERCURY", "mercury");
    none("NON-AEROSOL HAIR SPRAY", "pressurized");
    none("PROPELLANT FREE PUMP", "pressurized");
    none("TONER NO ALCOHOL 6 FL OZ", "alcohol");
    none("CONTAINS NO ALCOHOL", "alcohol");
    none("0% ALCOHOL", "alcohol");
    none("NON-ALCOHOLIC BEER 0.0% ABV", "alcoholic_drink");
    none("FRAGRANCE FREE LOTION", "fragrance");
    const some = (label: string, tag: string) => expect(labelTagsOf(label, ed), label).toContain(tag);
    some("CONTAINS ALCOHOL", "alcohol");
    some("NO PETS. FLAMMABLE", "flammable");
    some("NOT FOR CHILDREN. CONTAINS MERCURY", "mercury");
    some("NO. 5 EAU DE PARFUM", "fragrance");
    some("RED WINE 13.5% ALC/VOL", "alcoholic_drink");
  });

  it("reads labels the same whatever spaces and hyphens they use", () => {
    expect(labelTagsOf("STILL WATER 250 mL", ed)).toContain("liquid");
    expect(labelTagsOf("NON‑FLAMMABLE ALCOHOL‑FREE", ed)).not.toContain("flammable");
    expect(labelTagsOf("NON‑FLAMMABLE ALCOHOL‑FREE", ed)).not.toContain("alcohol");
    expect(labelTagsOf("CETEARYL  ALCOHOL", ed)).not.toContain("alcohol");
    expect(labelTagsOf("CETYL\nALCOHOL", ed)).not.toContain("alcohol");
    expect(labelTagsOf("POLYVINYL ALCOHOL", ed)).not.toContain("alcohol");
  });

  it("negates a hyphen-wrapped -free, and never silently negates across a plain line break", () => {
    const tags = (t: string) => labelTagsOf(t, ed);
    // "ALCOHOL-" then "FREE": a hyphen wrap is one word, so it negates.
    expect(tags("ALCOHOL-\nFREE LOTION 8 FL OZ")).not.toContain("alcohol");
    expect(tags("ALCOHOL-\nFREE LOTION 8 FL OZ")).not.toContain("alcohol_free_unsure");
    // "ALCOHOL" then "FREE ..." on the next line may be "alcohol-free" or "FREE SHIPPING": ask.
    expect(tags("ALCOHOL\nFREE LOTION 8 FL OZ")).not.toContain("alcohol");
    expect(tags("ALCOHOL\nFREE LOTION 8 FL OZ")).toContain("alcohol_free_unsure");
    expect(tags("INGREDIENTS: WATER, ALCOHOL\nFREE SHIPPING")).toContain("alcohol_free_unsure");
    // An unbroken mention elsewhere decides it without a question.
    expect(tags("ALCOHOL DENAT\nWATER, ALCOHOL\nFREE SHIPPING")).toContain("alcohol");
    expect(tags("ALCOHOL DENAT\nWATER, ALCOHOL\nFREE SHIPPING")).not.toContain("alcohol_free_unsure");
    // Other words are never negated across a plain break; only alcohol has a question to clear it.
    expect(tags("MERCURY\nFREE THERMOMETER")).toContain("mercury");
    // Same-line negation is unchanged.
    expect(tags("ALCOHOL FREE LOTION")).not.toContain("alcohol");
    expect(tags("ALCOHOL FREE LOTION")).not.toContain("alcohol_free_unsure");
    expect(tags("BODY LOTION\nALCOHOL 8 FL OZ")).toContain("alcohol");
    expect(tags("MARGARINE\nFREE FROM PALM OIL")).toContain("margarine");
  });

  it("reads a hazard word that wraps with a hyphen at the end of a line", () => {
    const tags = (t: string) => labelTagsOf(t, ed);
    expect(tags("EXTREMELY FLAM-\nMABLE")).toContain("flammable");
    expect(tags("CONTAINS ALCO-\nHOL 70%")).toContain("alcohol");
    // A negation before the wrapped word still negates it.
    expect(tags("NON-FLAM-\nMABLE")).not.toContain("flammable");
    expect(tags("NO FLAM-\nMABLE PARTS")).not.toContain("flammable");
    // Joining a wrap only ever adds a word: the unjoined text is still read.
    expect(tags("SHAMPOO-\nALCOHOL 5%")).toContain("alcohol");
  });

  it("reads plurals of the cream and gel words", () => {
    expect(labelTagsOf("ENERGY GELS", ed)).toContain("easily_liquefiable");
    expect(labelTagsOf("HAND CREAMS GIFT SET", ed)).toContain("easily_liquefiable");
    expect(labelTagsOf("LIP BALMS", ed)).toContain("easily_liquefiable");
  });

  it("reads sanitizer words in both spellings", () => {
    expect(labelTagsOf("HAND SANITIZER GEL", ed)).toContain("sanitizer");
    expect(labelTagsOf("SANITISING WIPES", ed)).toContain("sanitizer");
    expect(labelTagsOf("HAND SANITIZERS 3 PACK", ed)).toContain("sanitizer");
    expect(labelTagsOf("SHEA BODY LOTION", ed)).not.toContain("sanitizer");
  });

  it("reads hemp alone as a question and CBD as a hemp product", () => {
    expect(labelTagsOf("55% HEMP 45% COTTON", ed)).toContain("hemp_maybe");
    expect(labelTagsOf("55% HEMP 45% COTTON", ed)).not.toContain("hemp");
    expect(labelTagsOf("CBD OIL 500 MG", ed)).toContain("hemp");
    expect(labelTagsOf("HEMP SEED OIL LOTION", ed)).not.toContain("hemp");
  });

  it("reads replica and inert munitions (IMM 136.2) on the safe side: an extra question, never a missed one", () => {
    // A munition noun alone is enough (grenade, ordnance, munition, ammunition, ammo, mortar round or shell, warhead,
    // detonator, and the Spanish forms), except two brands. Round, shell, bomb, mine and rocket count when the label
    // anywhere carries a weapon cue: a caliber, or replica, inert, dummy, training, practice, fake, mock, military,
    // ordnance or tactical. No word ever clears a match.
    const munitions = ["REPLICA GRENADE", "GRENADE REPLICA", "REPLICA-GRENADE", "REPLICA M67 GRENADE", "GRANADA DE ENTRENAMIENTO",
      "Inert hand grenade, display only", "DUMMY ORDNANCE", "TRAINING ROUNDS 40MM", "deactivated mortar shell", "INERT 81MM MORTAR ROUND",
      "SHELL, INERT", "MUNICIONES DE FOGUEO", "Replica de granada", "AMMUNITION BOX 50 CAL REPLICA ROUNDS", "FAKE BOMB PROP",
      "IMITATION GRENADE PROP", "SIMULATED LAND MINE", "MOCK MORTAR SHELL", "TRAINING TOY ROCKET 40MM", "TRAINING MORTAR ROUND",
      "INERT .50 CAL ROUND", "12 GAUGE DUMMY SHELLS", "MILITARY TRAINING BOMB", "TACTICAL ROUND\nREPLICA", "TOY GRENADE", "FOAM ROCKET, REPLICA"];
    for (const label of munitions) expect(labelTagsOf(label, ed), label).toContain("replica_explosive");
    // Extra questions the safe side accepts, listed in docs/LIMITS.md.
    const extraQuestions = ["PRACTICE ROUND GOLF BALLS 12 PACK", "ROUND TRAINING TABLE", "TRAINING SHIRT\nROUND NECK", "MOCK NECK TOP\nROUND HEM",
      "AMMO CAN STORAGE BOX", "ROUND CRACKERS 120 CAL"];
    for (const label of extraQuestions) expect(labelTagsOf(label, ed), label).toContain("replica_explosive");
    for (const label of ["GRENADE PROTEIN BAR CARB KILLA", "Carb Killa by Grenade", "TOY CAR", "SEA SHELL NECKLACE", "INERT GAS",
      "BATH BOMB LAVENDER", "FOAM TOY ROCKET", "TOY SHELL SET", "WARHEADS EXTREME SOUR HARD CANDY", "MORTAR AND PESTLE GRANITE",
      "JUGO DE GRANADA 100%", "TRAINING PANTS SIZE 4T", "Training Day DVD", "MOCK NECK SWEATER", "ROUND TABLE COVER", "MINE CRAFT HOODIE"]) {
      expect(labelTagsOf(label, ed), label).not.toContain("replica_explosive");
    }
  });

  it("docs/LIMITS.md gives the number of label words the shipped edition has", () => {
    const limits = readFileSync(join(process.cwd(), "docs", "LIMITS.md"), "utf8");
    expect(limits).toContain(`The label words the rules look for (${bundled.labelWords.length} of them,`);
  });

  it("needs a medicine cue to read medicine, not the word tablet or capsule alone", () => {
    for (const label of ["TABLET COMPUTER", "TABLET 10.1 INCH 3.85V 7000mAh 26.95Wh", "COFFEE CAPSULES", "PARTY LOZENGES CANDY",
      "SODIUM 140 MG PER SERVING"]) {
      expect(labelTagsOf(label, ed), label).not.toContain("pharmaceutical");
    }
    for (const label of ["ASPIRIN TABLETS 325 MG", "IBUPROFEN 200", "DRUG FACTS", "COUGH DROPS", "THROAT LOZENGES", "Active ingredient: loratadine",
      "METFORMIN TABLETS 500 MG", "500 MG CAPSULES"]) {
      expect(labelTagsOf(label, ed), label).toContain("pharmaceutical");
    }
  });

  it("does not read fatty alcohols in a lotion as alcohol", () => {
    for (const label of ["WATER, CETEARYL ALCOHOL, GLYCERIN", "Cetyl Alcohol", "stearyl alcohol", "Benzyl Alcohol",
      "BEHENYL ALCOHOL", "Myristyl Alcohol", "Lanolin Alcohol", "Oleyl Alcohol", "Lauryl Alcohol", "Isostearyl Alcohol"]) {
      expect(labelTagsOf(label, ed), label).not.toContain("alcohol");
    }
    expect(labelTagsOf("ALCOHOL DENAT., CETEARYL ALCOHOL", ed)).toContain("alcohol");
    expect(labelTagsOf("SD Alcohol 40-B", ed)).toContain("alcohol");
  });

  it("reads tobacco and cigars from the label", () => {
    expect(labelTagsOf("20 CIGARETTES", ed)).toContain("tobacco");
    expect(labelTagsOf("Pipe Tobacco", ed)).toContain("tobacco");
    expect(labelTagsOf("SMOKELESS TOBACCO", ed)).toContain("tobacco");
    expect(labelTagsOf("Hand rolled cigars", ed)).toContain("cigar");
    expect(labelTagsOf("Hand rolled cigars", ed)).not.toContain("tobacco");
  });

  it("reads the gift words the destination lines need", () => {
    expect(labelTagsOf("MARGARINE SPREAD", ed)).toContain("margarine");
    expect(labelTagsOf("Chicken Dog Treats", ed)).toContain("pet_food");
    expect(labelTagsOf("GOLD BAR 1 OZ", ed)).toContain("bullion");
    expect(labelTagsOf("Heirloom Vegetable Seeds", ed)).toContain("plant");
    expect(labelTagsOf("VAPE PEN", ed)).toContain("vaping");
    expect(labelTagsOf("SESAME SEEDS", ed)).not.toContain("plant");
    expect(labelTagsOf("LED LIGHT BULBS", ed)).not.toContain("plant");
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

  it("takes a read's label words from its saved tags, never from the clipped label shown", () => {
    // The whole label said FLAMMABLE-FREE; the shown text was cut right after FLAMMABLE.
    const whole = `${"x".repeat(150)} FLAMMABLE-FREE LOTION`;
    const shown = Array.from(whole).slice(0, 160).join("");
    expect(shown.endsWith("FLAMMABLE")).toBe(true);
    const labelTags = labelTagsOf(whole, ed);
    expect(labelTags).not.toContain("flammable");
    expect(facts({ read: r({ category: "lotion_cream", labelText: shown, evidence: "label_read" }), labelTags }).tags).not.toContain("flammable");
    // And the other way: a word past the cut still counts, from the saved tags.
    const late = labelTagsOf(`${"x".repeat(170)} FLAMMABLE`, ed);
    expect(facts({ read: r({ labelText: "x".repeat(160) }), labelTags: late }).tags).toContain("flammable");
    // A client that sends no saved tags still has its label text read.
    expect(facts({ read: r({ labelText: "EXTREMELY FLAMMABLE" }), labelTags: [] }).tags).toContain("flammable");
  });

  it("uses a corrected label instead of the tags saved from the old one", () => {
    const corrected = facts({
      read: r({ category: "lotion_cream", labelText: "ALCOHOL LOTION 100 mL", liquid: true, evidence: "label_read" }),
      overrides: { labelText: "ALCOHOL-FREE LOTION 100 mL" },
      labelTags: ["alcohol", "label_text", "liquid"],
    });
    expect(corrected.tags).not.toContain("alcohol");
    expect(corrected.tags).toEqual(expect.arrayContaining(["label_text", "liquid"]));
    expect(corrected.alcohol).toBe("unknown");
  });

  it("takes the sender's own word that the label lists alcohol as settled, and still only asks on the model's flag", () => {
    expect(facts({ read: r({ category: "perfume_fragrance" }), overrides: { alcoholOnLabel: true } }).alcohol).toBe("yes");
    expect(facts({ read: r({ category: "perfume_fragrance", alcoholOnLabel: true }) }).alcohol).toBe("unknown");
    expect(facts({ read: r({ category: "perfume_fragrance", alcoholOnLabel: true }), overrides: { alcoholOnLabel: false } }).alcohol).toBe("unknown");
  });

  it("reads alcohol from label, then answer", () => {
    expect(facts({ read: r({ labelText: "ALCOHOL DENAT. 50 ML" }) }).alcohol).toBe("yes");
    expect(facts({ read: r({ alcoholOnLabel: true }) }).alcohol).toBe("unknown");
    expect(facts({ read: r({ alcoholOnLabel: true }) }).tags).toContain("alcohol_flag");
    expect(facts({ read: r({ category: "perfume_fragrance" }) }).alcohol).toBe("unknown");
    expect(facts({ read: r({ category: "perfume_fragrance" }), answers: { label_alcohol: "no" } }).alcohol).toBe("no");
    expect(facts({ read: r({ category: "perfume_fragrance" }), answers: { label_alcohol: "yes" } }).alcohol).toBe("yes");
    expect(facts({ read: r({ category: "perfume_fragrance" }), answers: { label_alcohol: "cannot_tell" } }).alcohol).toBe("unknown");
  });

  it("leaves alcohol to the sender when FREE starts the line after ALCOHOL", () => {
    const wrapped = r({ category: "lotion_cream", labelText: "ALCOHOL\nFREE LOTION 8 FL OZ" });
    expect(facts({ read: wrapped }).alcohol).toBe("unknown");
    expect(facts({ read: wrapped, answers: { label_alcohol_free: "yes" } }).alcohol).toBe("no");
    expect(facts({ read: wrapped, answers: { label_alcohol_free: "no" } }).alcohol).toBe("yes");
    expect(facts({ read: wrapped, answers: { label_alcohol_free: "no" } }).tags).toContain("alcohol");
    // The answer means nothing without the wrapped reading: it never clears a plain ALCOHOL.
    expect(facts({ read: r({ labelText: "ALCOHOL DENAT. 50 ML" }), answers: { label_alcohol_free: "yes" } }).alcohol).toBe("yes");
  });

  it("keeps the stricter reading when the label and the answer disagree on alcohol", () => {
    expect(facts({ read: r({ labelText: "ALCOHOL DENAT." }), answers: { label_alcohol: "no" } }).alcohol).toBe("yes");
    expect(facts({ read: r({ alcoholOnLabel: true }), answers: { label_alcohol: "no" } }).alcohol).toBe("no");
  });

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
