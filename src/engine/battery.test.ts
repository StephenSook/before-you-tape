import { describe, expect, it } from "vitest";
import bundled from "../../rules/edition.json";
import type { ItemRead } from "../shared/itemRead";
import { crossCheckWh, deriveBattery } from "./battery";
import { parseEdition } from "./edition";
import type { ItemAnswers } from "./types";

const limits = parseEdition(bundled).limits;

const base: ItemRead = {
  itemName: "Phone", category: "phone", labelText: "", volts: 0, milliampHours: 0, wattHours: 0, lithiumGrams: 0,
  batteryWords: false, liquid: false, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false,
  glassContainer: false, powder: false, retailBox: "sealed", evidence: "label_read",
};
const read = (patch: Partial<ItemRead>): ItemRead => ({ ...base, ...patch });
const bat = (patch: Partial<ItemRead>, answers: ItemAnswers = {}) => deriveBattery(read(patch), answers, 1, limits, []);

describe("crossCheckWh", () => {
  it("matches agreeing numbers", () => {
    expect(crossCheckWh(3.7, 5000, 18.5, 3)).toBe("printed_matches");
    expect(crossCheckWh(11.55, 4380, 50.6, 3)).toBe("printed_matches");
  });

  it("catches the measured misread", () => expect(crossCheckWh(3.7, 2500, 9.62, 3)).toBe("printed_mismatch"));
});

describe("deriveBattery", () => {
  it("uses printed Wh only when confirmed or alone", () => {
    expect(bat({ volts: 3.7, milliampHours: 5000, wattHours: 18.5 }).wh).toBe(18.5);
    expect(bat({ wattHours: 18.5 })).toMatchObject({ whStatus: "printed_only", wh: 18.5 });
    const est = bat({ volts: 3.7, milliampHours: 5000 });
    expect(est.whStatus).toBe("computed_only");
    expect(est.wh).toBeNull();
    expect(est.whComputed).toBe(18.5);
  });

  it("drops the printed Wh on a mismatch", () => {
    const m = bat({ volts: 3.7, milliampHours: 2500, wattHours: 9.62 });
    expect(m.whStatus).toBe("printed_mismatch");
    expect(m.wh).toBeNull();
  });

  it("flags implausible volts", () => {
    expect(bat({ volts: 3700, milliampHours: 5000, wattHours: 18.5 }).whStatus).toBe("implausible");
    expect(bat({ volts: 3.7, milliampHours: 5, wattHours: 18.5 }).whStatus).toBe("implausible");
    expect(bat({ wattHours: 500 }).whStatus).toBe("implausible");
    expect(bat({ volts: 3700, milliampHours: 5000, wattHours: 18.5 }).wh).toBeNull();
  });

  it("reports none when no number is printed", () => expect(bat({}).whStatus).toBe("none"));

  it("decides battery or unknown, never cell by guess", () => {
    expect(bat({ volts: 11.55, milliampHours: 4380, wattHours: 50.6 }).countAs).toBe("battery");
    expect(bat({ volts: 3.85, milliampHours: 4000, wattHours: 15.4 }).countAs).toBe("unknown");
    expect(bat({ volts: 3.85, milliampHours: 4000, wattHours: 15.4 }, { cell_count: "one" }).countAs).toBe("cell");
    expect(bat({ volts: 3.85, milliampHours: 4000, wattHours: 15.4 }, { cell_count: "more_than_one" }).countAs).toBe("battery");
    expect(bat({ volts: 3.85, milliampHours: 4000, wattHours: 15.4 }, { cell_count: "not_sure" }).countAs).toBe("unknown");
    expect(bat({ volts: 3700, milliampHours: 5000, wattHours: 18.5 }).countAs).toBe("unknown");
  });

  it("reads lithium metal from the tags", () => {
    expect(deriveBattery(read({ batteryWords: true }), {}, 1, limits, ["li_metal"]).chemistry).toBe("li_metal");
    expect(deriveBattery(read({ volts: 3.7, milliampHours: 2000 }), {}, 1, limits, []).chemistry).toBe("li_ion");
  });

  it("has no battery for clothing and carries quantity", () => {
    expect(bat({ category: "clothing" }).presence).toBe("none");
    expect(deriveBattery(read({ category: "phone", batteryWords: true }), {}, 3, limits, []).units).toBe(3);
  });

  it("decides presence from the answer first, then the category and evidence", () => {
    expect(bat({ category: "power_bank" }).presence).toBe("loose");
    expect(bat({ category: "loose_battery" }).presence).toBe("loose");
    expect(bat({ category: "laptop" }).presence).toBe("installed");
    expect(bat({ category: "laptop" }, { battery_installed: "packed_beside" }).presence).toBe("packed_beside");
    expect(bat({ category: "other_electronics" }).presence).toBe("unknown");
    expect(bat({ category: "other_electronics", batteryWords: true }).presence).toBe("unknown");
    expect(bat({ category: "other_electronics", batteryWords: true, milliampHours: 2000 }).presence).toBe("installed");
    expect(bat({ category: "other_electronics", volts: 125 }).presence).toBe("unknown");
    expect(bat({ category: "other_electronics" }, { battery_installed: "none" }).presence).toBe("none");
    expect(bat({ category: "battery_toy", batteryWords: true }, { battery_installed: "not_lithium" }).presence).toBe("none");
    expect(bat({ category: "phone" }, { battery_installed: "none" }).presence).toBe("installed");
    expect(bat({ category: "toy", batteryWords: true }).presence).toBe("unknown");
  });

  it("keeps a power bank or loose battery loose whatever a saved answer says", () => {
    const pb = { category: "power_bank" as const, volts: 3.7, milliampHours: 2600, wattHours: 9.62, batteryWords: true };
    expect(bat(pb, { battery_installed: "installed", device_condition: "new_sealed" }).presence).toBe("loose");
    expect(bat({ category: "loose_battery" }, { battery_installed: "installed" }).presence).toBe("loose");
  });
});
