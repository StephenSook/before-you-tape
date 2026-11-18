import { describe, expect, it } from "vitest";
import bundled from "../../rules/edition.json";
import { parseEdition } from "../../src/engine/edition";
import { evaluateItemRules } from "../../src/engine/itemRules";
import type { BatteryFacts, ItemFacts, Predicate } from "../../src/engine/types";

const ed = parseEdition(bundled);

const noBattery: BatteryFacts = {
  presence: "none", chemistry: "unknown", volts: null, milliampHours: null, whPrinted: null, whComputed: null,
  whStatus: "none", wh: null, lithiumGrams: null, countAs: "unknown", units: 1,
};
const f = (patch: Omit<Partial<ItemFacts>, "battery"> & { battery?: Partial<BatteryFacts> }): ItemFacts => ({
  category: "other", tags: [], evidence: "label_read", identity: "label", condition: "unknown", alcohol: "unknown",
  quantity: 1, ...patch, battery: { ...noBattery, ...patch.battery },
});
const device = (category: ItemFacts["category"], battery: Partial<BatteryFacts>, condition: ItemFacts["condition"] = "new_sealed") =>
  f({ category, tags: ["electronics"], condition, battery: { presence: "installed", chemistry: "li_ion", ...battery } });

const perfumeAlcohol = f({ category: "perfume_fragrance", tags: ["alcohol", "fragrance", "liquid"], alcohol: "yes" });
const perfumeUnknown = f({ category: "perfume_fragrance", tags: ["fragrance", "liquid"], alcohol: "unknown" });
const aerosol = f({ category: "aerosol_spray", tags: ["pressurized"] });
const powerBank = f({ category: "power_bank", battery: { presence: "loose", chemistry: "li_ion", countAs: "battery" } });
const usedPhone = device("phone", { whStatus: "printed_matches", wh: 15.4, countAs: "cell" }, "used");
const bigBattery = device("laptop", { whStatus: "printed_matches", wh: 120, countAs: "battery" });
const mismatchPhone = device("phone", { whStatus: "printed_mismatch", wh: null });
const noWhPhone = device("phone", { whStatus: "none", wh: null });
const openedPhone = device("phone", { whStatus: "printed_matches", wh: 15.4, countAs: "cell" }, "new_opened");
const coinCellToy = f({ category: "battery_toy", tags: ["toy", "li_metal"], condition: "new_sealed",
  battery: { presence: "installed", chemistry: "li_metal" } });
const sealedLaptopFacts = device("laptop", { whStatus: "printed_matches", wh: 50.6, countAs: "battery" });
const okPhone = device("phone", { whStatus: "printed_matches", wh: 15.4, countAs: "cell" });

const hit = (x: ItemFacts) => evaluateItemRules(x, ed.rules).map((h) => `${h.ruleId}:${h.level}`);

describe("USPS export rule data", () => {
  it("takes out the clear cases", () => {
    expect(hit(perfumeAlcohol)).toContain("USPS-INTL-FLAMMABLE-LIQUID:take_out");
    expect(hit(aerosol)).toContain("USPS-INTL-AEROSOL:take_out");
    expect(hit(powerBank)).toContain("USPS-INTL-LI-LOOSE:take_out");
    expect(hit(usedPhone)).toContain("USPS-INTL-LI-USED-DEVICE:take_out");
    expect(hit(bigBattery)).toContain("USPS-INTL-LI-BATTERY-OVER:take_out");
  });

  it("checks the unclear cases", () => {
    expect(hit(mismatchPhone)).toContain("USPS-INTL-LI-WH-MISMATCH:check");
    expect(hit(noWhPhone)).toContain("USPS-INTL-LI-NO-WH:check");
    expect(hit(openedPhone)).toContain("USPS-INTL-LI-NEW-OPENED:check");
    expect(hit(coinCellToy)).toContain("USPS-INTL-LI-METAL-UNKNOWN:check");
  });

  it("takes out the other prohibited goods", () => {
    expect(hit(f({ category: "alcohol_drink", tags: ["alcohol", "liquid"], alcohol: "yes" }))).toContain("USPS-INTL-ALCOHOL-DRINK:take_out");
    expect(hit(f({ category: "lighter_matches", tags: ["flammable"] }))).toContain("USPS-INTL-MATCHES-LIGHTERS:take_out");
    expect(hit(f({ category: "e_cigarette" }))).toContain("USPS-INTL-ENDS:take_out");
    expect(hit(f({ tags: ["mercury"] }))).toContain("USPS-INTL-MERCURY:take_out");
    expect(hit(f({ tags: ["hemp"] }))).toContain("USPS-INTL-HEMP:take_out");
    expect(hit(f({ tags: ["dry_ice"] }))).toContain("USPS-INTL-DRY-ICE:take_out");
    expect(hit(f({ tags: ["tobacco"] }))).toContain("USPS-INTL-TOBACCO:take_out");
    expect(hit(f({ tags: ["magnet"] }))).toContain("USPS-INTL-MAGNET:check");
    expect(hit(f({ category: "glue_paint", tags: ["liquid"] }))).toContain("USPS-INTL-GLUE-PAINT:check");
    expect(hit(f({ category: "nail_polish", tags: ["cosmetic", "flammable", "liquid"] }))).toContain("USPS-INTL-FLAMMABLE-LIQUID:take_out");
    expect(hit(f({ category: "candle", tags: ["flammable"] }))).toContain("USPS-INTL-FLAMMABLE-OTHER:take_out");
    expect(hit(f({ category: "lighter_matches", tags: ["flammable"] }))).not.toContain("USPS-INTL-FLAMMABLE-OTHER:take_out");
  });

  it("checks cigars, which only some countries accept", () =>
    expect(hit(f({ category: "other", tags: ["cigar"] }))).toContain("USPS-INTL-CIGAR:check"));

  it("leaves the box rules to the box check and keeps them in the data", () => {
    const ids = ed.rules.filter((r) => r.scope !== "item").map((r) => r.id).sort();
    expect(ids).toEqual(["USPS-INTL-LI-BOX-COUNT", "USPS-INTL-LI-BOX-MIXED", "USPS-INTL-LI-NO-MARKING", "USPS-INTL-LI-TWO-BOXES"]);
  });

  it("asks about alcohol on an unread fragrance", () =>
    expect(evaluateItemRules(perfumeUnknown, ed.rules).find((h) => h.ruleId === "DATA-NEEDS-ANSWER")?.askId).toBe("label_alcohol"));

  it("asks whether a device is new, and where an unknown battery is", () => {
    const asks = (x: ItemFacts) => evaluateItemRules(x, ed.rules).filter((h) => h.ruleId === "DATA-NEEDS-ANSWER").map((h) => h.askId);
    expect(asks(device("phone", { whStatus: "printed_matches", wh: 15.4 }, "unknown"))).toContain("device_condition");
    expect(asks(f({ category: "other_electronics", battery: { presence: "unknown" } }))).toContain("battery_installed");
    expect(asks(okPhone)).toEqual([]);
  });

  it("flags an unsure read and an item it cannot name", () => {
    expect(hit(f({ evidence: "not_sure", category: "toy", tags: ["toy"] }))).toContain("DATA-UNSURE:check");
    expect(hit(f({ category: "other" }))).toContain("DATA-UNSURE:check");
  });

  it("finds nothing on a new phone with a confirmed rating, or on plain clothing", () => {
    expect(hit(okPhone)).toEqual([]);
    expect(hit(f({ category: "clothing", tags: ["clothing"] }))).toEqual([]);
    expect(hit(f({ category: "lotion_cream", tags: ["cosmetic", "easily_liquefiable", "liquid"], alcohol: "unknown" }))).toEqual([]);
  });

  it("emits no box or destination rule from one item", () => {
    for (const h of evaluateItemRules(sealedLaptopFacts, ed.rules)) expect(h.ruleId).not.toMatch(/BOX|DEST|LAYER/);
  });

  it("gives every rule a section, an https url and wording", () => {
    expect(ed.rules.length).toBeGreaterThanOrEqual(25);
    for (const r of ed.rules) {
      expect(r.section).not.toBe("");
      expect(r.url).toMatch(/^https:\/\//);
      expect(r.ourWording.length).toBeGreaterThan(10);
    }
  });

  it("uses the edition limits in the Wh and lithium gram rules", () => {
    const gtValue = (id: string, fact: string): unknown => {
      const find = (p: Predicate): unknown =>
        "all" in p ? p.all.map(find).find((v) => v !== undefined)
          : "any" in p ? p.any.map(find).find((v) => v !== undefined)
            : "not" in p ? find(p.not)
              : p.fact === fact && p.op === "gt" ? p.value : undefined;
      return find(ed.rules.find((r) => r.id === id)!.when);
    };
    expect(gtValue("USPS-INTL-LI-CELL-OVER", "battery.wh")).toBe(ed.limits.cellMaxWh);
    expect(gtValue("USPS-INTL-LI-BATTERY-OVER", "battery.wh")).toBe(ed.limits.batteryMaxWh);
    expect(gtValue("USPS-INTL-LI-METAL-CELL-OVER", "battery.lithiumGrams")).toBe(ed.limits.cellMaxLithiumG);
    expect(gtValue("USPS-INTL-LI-METAL-BATTERY-OVER", "battery.lithiumGrams")).toBe(ed.limits.batteryMaxLithiumG);
    expect(gtValue("USPS-INTL-LI-METAL-CLASS", "battery.lithiumGrams")).toBe(ed.limits.cellMaxLithiumG);
  });

  it("keeps the no-rating wording for sealed boxes", () =>
    expect(ed.rules.find((r) => r.id === "USPS-INTL-LI-NO-WH")?.ourWording).toBe(
      "We can't see the battery rating through the box. Type the Wh from the box or the maker's page.",
    ));

  it("marks the power bank rule as an inference", () =>
    expect(ed.rules.find((r) => r.id === "USPS-INTL-LI-LOOSE")?.basis).toBe("inference"));
});
