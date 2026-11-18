import { describe, expect, it } from "vitest";
import { evaluateItemRules } from "./itemRules";
import type { BatteryFacts, ItemFacts, Rule } from "./types";

const battery: BatteryFacts = {
  presence: "none", chemistry: "unknown", volts: null, milliampHours: null, whPrinted: null, whComputed: null,
  whStatus: "none", wh: null, lithiumGrams: null, countAs: "unknown", units: 1,
};
const facts = (patch: Partial<ItemFacts>): ItemFacts => ({
  category: "other", tags: [], evidence: "label_read", identity: "label", battery, condition: "unknown",
  alcohol: "unknown", quantity: 1, ...patch,
});
const rule = (patch: Partial<Rule>): Rule => ({
  id: "R", layer: "usps_export", scope: "item", section: "Pub 52 623", url: "https://pe.usps.com/text/pub52/pub52c6_006.htm",
  basis: "summarized", ourWording: "Our wording for this rule.", when: { fact: "tags", op: "has", value: "x" },
  outcome: "take_out", ...patch,
});

describe("evaluateItemRules", () => {
  it("turns a matching item rule into a hit with its section, link and wording", () =>
    expect(evaluateItemRules(facts({ tags: ["x"] }), [rule({})])).toEqual([
      { ruleId: "R", layer: "usps_export", level: "take_out", text: "Our wording for this rule.", section: "Pub 52 623",
        url: "https://pe.usps.com/text/pub52/pub52c6_006.htm" },
    ]));

  it("skips rules that do not match", () => expect(evaluateItemRules(facts({ tags: ["y"] }), [rule({})])).toEqual([]));

  it("ignores box and note rules, which only the box check emits", () =>
    expect(evaluateItemRules(facts({ tags: ["x"] }), [rule({ id: "B", scope: "box" }), rule({ id: "N", scope: "note" })])).toEqual([]));

  it("keeps the data layer and the question id", () =>
    expect(evaluateItemRules(facts({ tags: ["x"] }), [rule({ id: "D", layer: "data", outcome: "check", askId: "label_alcohol" })])[0])
      .toMatchObject({ ruleId: "D", layer: "data", level: "check", askId: "label_alcohol" }));

  it("lists hits in rule order", () =>
    expect(evaluateItemRules(facts({ tags: ["x"] }), [rule({ id: "A" }), rule({ id: "B", outcome: "check" })]).map((h) => h.ruleId))
      .toEqual(["A", "B"]));
});
