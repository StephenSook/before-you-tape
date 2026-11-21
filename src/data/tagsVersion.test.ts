import { describe, expect, it } from "vitest";
import { ed } from "../../tests/engine/helpers";
import { evaluateBox } from "../engine/verdict";
import { resolveDestination } from "../engine/edition";
import type { BoxItemInput, RuleEdition } from "../engine/types";
import { guardStaleTags, labelWordsVersion, LABEL_AGAIN, LABEL_UNKNOWN, LITHIUM_BOX_WAITS, LITHIUM_WAITS } from "./tagsVersion";

// An edition whose label words lack the replica munitions words, as revision 3's did.
const older: RuleEdition = { ...ed, labelWords: ed.labelWords.filter((w) => w.tag !== "replica_explosive") };

const item = (o: Partial<BoxItemInput> & { itemId: string; tagsVersion?: string }): BoxItemInput & { tagsVersion?: string } => ({
  read: {
    itemName: "Item", category: "clothing", labelText: "", volts: 0, milliampHours: 0, wattHours: 0, lithiumGrams: 0, batteryWords: false,
    liquid: false, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false, glassContainer: false, powder: false,
    retailBox: "cannot_tell", evidence: "label_read",
  },
  overrides: {}, answers: {}, quantity: 1, identityConfirmedBy: null, labelTags: ["label_text"], ...o,
});
const judge = (items: Array<BoxItemInput & { tagsVersion?: string }>) => guardStaleTags(
  evaluateBox(items, ed, resolveDestination(ed, "CA", undefined, "2026-11-20"), "2026-11-20"), items, labelWordsVersion(ed));

describe("labelWordsVersion", () => {
  it("names the label words, so an edition with other words has another version", () => {
    expect(labelWordsVersion(ed)).toMatch(/^[0-9a-f]{8}$/);
    expect(labelWordsVersion({ ...ed })).toBe(labelWordsVersion(ed));
    expect(labelWordsVersion(older)).not.toBe(labelWordsVersion(ed));
  });
});

describe("guardStaleTags", () => {
  it("holds at Check this an item whose saved tags other label words made, and says to read the label again", () => {
    const r = judge([item({ itemId: "old", tagsVersion: labelWordsVersion(older) }), item({ itemId: "unknown" })]);
    expect(r.items.old).toMatchObject({ level: "check", headline: "Check this" });
    expect(r.items.old?.hits[0]).toMatchObject({ ruleId: "DATA-LABEL-AGAIN", layer: "data", level: "check", text: LABEL_AGAIN });
    // Saved before the version was kept: an earlier version of the app read it.
    expect(r.items.unknown?.hits[0]).toMatchObject({ ruleId: "DATA-LABEL-AGAIN", text: LABEL_UNKNOWN });
    expect(r.counts).toEqual({ ok: 0, check: 2, takeOut: 0 });
  });

  it("leaves alone tags the current words made, tags with no label behind them, and a label the sender typed again", () => {
    const now = labelWordsVersion(ed);
    const r = judge([
      item({ itemId: "current", tagsVersion: now }),
      item({ itemId: "no-label", labelTags: [], identityConfirmedBy: "sender", read: { ...item({ itemId: "x" }).read, evidence: "item_seen" } }),
      item({ itemId: "typed-again", overrides: { labelText: "COTTON T-SHIRT" } }),
    ]);
    for (const id of ["current", "no-label", "typed-again"]) {
      expect(r.items[id]?.hits.filter((h) => h.level !== "note").map((h) => h.ruleId).join(","), id).toBe("");
      expect(r.items[id]?.level, id).toBe("ok");
      expect(r.items[id]?.hits.map((h) => h.ruleId), id).not.toContain("DATA-LABEL-AGAIN");
    }
  });

  it("never lowers a Take it out", () => {
    const r = judge([item({ itemId: "spray", read: { ...item({ itemId: "x" }).read, category: "aerosol_spray", pressurized: true } })]);
    expect(r.items.spray?.level).toBe("take_out");
  });

  it("lets an item already at Take it out, out of the lithium count, hold nothing else", () => {
    const phone = item({
      itemId: "phone", tagsVersion: labelWordsVersion(ed), answers: { device_condition: "new_sealed" },
      read: { ...item({ itemId: "x" }).read, category: "phone", volts: 3.85, milliampHours: 4000, wattHours: 15.4, batteryWords: true, retailBox: "sealed" },
    });
    const spray = item({ itemId: "spray", tagsVersion: labelWordsVersion(older), read: { ...item({ itemId: "x" }).read, category: "aerosol_spray", pressurized: true } });
    const r = judge([phone, spray]);
    expect(r.items.spray?.level).toBe("take_out");
    expect(r.lithium.status).toBe("ok");
    expect(r.items.phone?.level).toBe("ok");
    expect(r.items.phone?.hits.map((h) => h.ruleId)).not.toContain("DATA-LABEL-AGAIN");
  });

  it("makes the box's lithium total wait while an item's label must be read again", () => {
    const phone = item({
      itemId: "phone", tagsVersion: labelWordsVersion(ed), answers: { device_condition: "new_sealed" },
      read: { ...item({ itemId: "x" }).read, category: "phone", volts: 3.85, milliampHours: 4000, wattHours: 15.4, batteryWords: true, retailBox: "sealed" },
    });
    const before = judge([phone]);
    expect(before.lithium.status).toBe("ok");
    const r = judge([phone, item({ itemId: "old", tagsVersion: labelWordsVersion(older) })]);
    expect(r.lithium).toMatchObject({ status: "depends", text: LITHIUM_BOX_WAITS });
    expect(r.items.phone).toMatchObject({ level: "check" });
    expect(r.items.phone?.hits[0]).toMatchObject({ ruleId: "DATA-LABEL-AGAIN", text: LITHIUM_WAITS });
  });
});
