import { describe, expect, it } from "vitest";
import bundled from "../rules/edition.json";
import live from "../rules/live-engines.json";
import { checkPinSet, factsBeyondLiveEngines, factsOf } from "./pin-guard";

describe("pin guard", () => {
  it("finds every fact an edition's rules and lines read", () => {
    const raw = { rules: [{ when: { all: [{ fact: "category", op: "eq", value: "x" }, { not: { fact: "battery.wh", op: "gt", value: 1 } }] } }],
      destinations: { CA: { lines: [{ matches: { any: [{ fact: "tags", op: "has", value: "y" }] } }] } } };
    expect([...factsOf(raw)].sort()).toEqual(["battery.wh", "category", "tags"]);
  });

  it("names the facts an edition uses that the engine in a live app build does not know", () => {
    expect(factsBeyondLiveEngines({ rules: [{ when: { fact: "category", op: "eq", value: "x" } }] })).toEqual([]);
    expect(factsBeyondLiveEngines({ rules: [{ when: { fact: "battery.numbersFrom", op: "eq", value: "typed" } }] })).toEqual(["battery.numbersFrom"]);
    // This build's edition reads battery.numbersFrom, which android-judge-3 and iPhone build 2 refuse.
    expect(factsBeyondLiveEngines(bundled)).toEqual(["battery.numbersFrom"]);
    expect(live.builds).toEqual(expect.arrayContaining(["android-judge-3", "iPhone build 2"]));
  });

  it("refuses a pin to an edition a live build would refuse, or to one this checkout cannot check", () => {
    expect(() => checkPinSet({ rules_edition_id: bundled.editionId }, bundled)).toThrow(/battery\.numbersFrom/);
    expect(() => checkPinSet({ rules_edition_id: "byt-0000000000ab" }, bundled)).toThrow(/rules\/edition\.json/);
    expect(() => checkPinSet({ rules_edition_id: "" }, bundled)).not.toThrow();
    expect(() => checkPinSet({ kill_cloud: "true" }, bundled)).not.toThrow();
    const known = new Set([...live.facts, "battery.numbersFrom"]);
    expect(() => checkPinSet({ rules_edition_id: bundled.editionId }, bundled, known)).not.toThrow();
  });
});
