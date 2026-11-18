import { describe, expect, it } from "vitest";
import bundled from "../../rules/edition.json";
import { parseEdition } from "./edition";
import { evaluateLithiumBox, TWO_BOX_NOTE, type LithiumEntry } from "./lithiumBox";
import type { BatteryFacts, LithiumLimits } from "./types";

const limits = parseEdition(bundled).limits;

const battery = (patch: Partial<BatteryFacts>): BatteryFacts => ({
  presence: "installed", chemistry: "li_ion", volts: null, milliampHours: null, whPrinted: null, whComputed: null,
  whStatus: "none", wh: null, lithiumGrams: null, countAs: "unknown", units: 1, ...patch,
});
const entry = (itemId: string, patch: Partial<BatteryFacts>): LithiumEntry => ({ itemId, battery: battery(patch) });
const cell = (id: string, units = 1) => entry(id, { countAs: "cell", units });
const batt = (id: string, units = 1) => entry(id, { countAs: "battery", units });
const unk = (id: string, units = 1) => entry(id, { countAs: "unknown", units });
const run = (entries: LithiumEntry[], l: LithiumLimits = limits) => evaluateLithiumBox(entries, l);

describe("evaluateLithiumBox", () => {
  it("is none when empty", () => expect(run([]).status).toBe("none"));

  it("allows 4 cells and refuses 5", () => {
    expect(run([cell("a"), cell("b"), cell("c"), cell("d")]).status).toBe("ok");
    expect(run([cell("a"), cell("b"), cell("c"), cell("d"), cell("e")]).text).toBe("5 cells in this box. The limit is 4. " + TWO_BOX_NOTE);
  });

  it("allows 2 batteries and refuses 3", () => {
    expect(run([batt("a"), batt("b")]).status).toBe("ok");
    expect(run([batt("a"), batt("b"), batt("c")]).text).toContain("3 batteries in this box. The limit is 2.");
  });

  it("calls a battery plus a cell mixed, with the two-box note", () => {
    const r = run([batt("laptop"), cell("phone")]);
    expect(r.status).toBe("mixed");
    expect(r.text).toContain("4 cells or 2 batteries, not both");
    expect(r.text).toContain(TWO_BOX_NOTE);
  });

  it("stays over when a box is over a limit and also has both kinds", () => {
    const r = run([batt("a"), batt("b"), batt("c"), cell("phone")]);
    expect(r.status).toBe("over");
    expect(r.text).toContain("3 batteries and 1 cell in this box.");
    expect(r.text).toContain(TWO_BOX_NOTE);
  });

  it("counts quantity", () => {
    expect(run([cell("p", 3)]).cells).toEqual({ min: 3, max: 3 });
    expect(run([cell("p", 5)]).status).toBe("over");
  });

  it("depends when unknowns change the answer", () => {
    expect(run([unk("phone")]).status).toBe("ok");
    expect(run([unk("a"), unk("b"), unk("c")]).status).toBe("depends");
    expect(run([batt("laptop"), unk("phone")]).status).toBe("depends");
    expect(run([batt("laptop"), unk("phone")]).unknownItemIds).toEqual(["phone"]);
    expect(run([unk("a"), unk("b"), unk("c")]).text).toContain(TWO_BOX_NOTE);
  });

  it("reports the range of counts across the readings", () => {
    const r = run([batt("laptop"), unk("phone", 2)]);
    expect(r.cells).toEqual({ min: 0, max: 2 });
    expect(r.batteries).toEqual({ min: 1, max: 3 });
    expect(r.itemIds).toEqual(["laptop", "phone"]);
  });

  it("is over when every reading is over", () => expect(run([unk("pack", 5)]).status).toBe("over"));

  it("ignores loose batteries", () =>
    expect(run([entry("pb", { presence: "loose", countAs: "battery", units: 1 })]).status).toBe("none"));

  it("maps unknowns to cells under assume_cell", () => {
    const l = { ...limits, unknownCountPolicy: "assume_cell" as const };
    expect(run([batt("laptop"), unk("phone")], l).status).toBe("mixed");
    expect(run([unk("a"), unk("b"), unk("c")], l).status).toBe("ok");
  });

  it("follows the mixed outcome setting only through its status", () =>
    expect(run([batt("laptop"), cell("phone")], { ...limits, mixedOutcome: "take_out" }).status).toBe("mixed"));
});
