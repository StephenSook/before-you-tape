// The two baselines every eval report shows beside each model path (eval/PROTOCOL.md, Baselines). Neither
// calls a model: one answers "Check this" for every row, the other judges each item as a person would type it.
import { describe, expect, it } from "vitest";
import { ed } from "../../tests/engine/helpers";
import { alwaysCheckRun, rulesOnlyRun, typedCategoriesOf, typedRead, type BaselineMeta } from "./baselines";
import { buildEvalSet, type SetLabels, type SetManifest } from "./loadSet";
import { computeEvalMetrics } from "./metrics";

const prov = { sourcePage: "https://example.org/p", author: "A", license: "CC0 1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", changes: "re-encoded" };
const mItem = (itemId: string, printed: SetManifest["items"][number]["printed"] = null) => ({
  itemId, photo: `/eval/items/${itemId}.jpg`, photoSha256: "a".repeat(64), photoSha256Original: "b".repeat(64), widthPx: 1, heightPx: 1, alt: itemId, printed, provenance: prov,
});
const manifest: SetManifest = {
  setId: "s", destinations: [{ code: "CA", name: "Canada" }, { code: "PH", name: "Philippines" }], publishing: { maxSide: 1600, jpegQuality: 88 },
  protocolSha256: "", labelsSha256: "",
  items: [mItem("bank", { volts: 3.7, milliampHours: 10000, wattHours: 37 }), mItem("bank2", { volts: 3.7, milliampHours: 10000, wattHours: 37 }), mItem("shirt")],
};
const labels: SetLabels = { setId: "s", status: "draft", items: {
  bank: { CA: { expected: "take_out", section: "Pub 52 622.5" }, PH: { expected: "take_out", section: "Pub 52 622.5" } },
  bank2: { CA: { expected: "take_out", section: "Pub 52 622.5" }, PH: { expected: "take_out", section: "Pub 52 622.5" } },
  shirt: { CA: { expected: "ok", section: "none" }, PH: { expected: "check", section: "IMM" } },
}, typed: { bank: { category: "power_bank" }, bank2: { category: "power_bank" }, shirt: { category: "clothing" } } };
const set = buildEvalSet(manifest, labels);
const meta: BaselineMeta = { date: "2026-11-20", machine: "test", editionId: ed.editionId };

describe("always Check this", () => {
  const run = alwaysCheckRun(set, meta);

  it("answers Check this on every row, item by destination, with no model path", () => {
    expect(run.rows).toHaveLength(6);
    expect(new Set(run.rows.map((r) => r.shipped.level))).toEqual(new Set(["check"]));
    expect(run.rows.every((r) => r.device === null && r.cloud === null && !r.shipped.secondLook)).toBe(true);
    expect(run.modelShown).toBe("none");
  });

  it("never calls a hazard OK, checks every row, and agrees only where the label is Check this", () => {
    const m = computeEvalMetrics(set, run);
    expect(m.hazardCalledOk).toMatchObject({ k: 0, n: 3 });
    expect(m.checkRate).toEqual({ k: 6, n: 6 });
    expect(m.truthAgreement).toEqual({ k: 1, n: 6 });
  });
});

describe("rules only", () => {
  it("types an item as a person would: its category and printed numbers, nothing read from a label", () => {
    const r = typedRead("power_bank", { volts: 3.7, milliampHours: 10000, wattHours: 37 });
    expect(r).toMatchObject({ category: "power_bank", volts: 3.7, milliampHours: 10000, wattHours: 37, lithiumGrams: 0, labelText: "", evidence: "item_seen", retailBox: "cannot_tell" });
    expect([r.batteryWords, r.liquid, r.pressurized, r.alcoholOnLabel, r.flammableOnLabel, r.glassContainer, r.powder]).toEqual([false, false, false, false, false, false, false]);
    expect(typedRead("clothing", null)).toMatchObject({ volts: 0, milliampHours: 0, wattHours: 0 });
  });

  it("judges with the rule edition: a typed power bank is taken out for both countries", () => {
    const run = rulesOnlyRun(set, typedCategoriesOf(labels, manifest), ed, meta);
    const level = (id: string, d: string) => run.rows.find((r) => r.itemId === id && r.destination === d)!.shipped.level;
    expect([level("bank", "CA"), level("bank", "PH")]).toEqual(["take_out", "take_out"]);
    expect(run.rows.every((r) => r.device === null && r.cloud === null)).toBe(true);
    expect(run.rows.map((r) => r.shipped.source)).toEqual(Array(6).fill("rules_only"));
  });

  it("refuses to run until every item has a typed category, and names the ones missing", () => {
    const missing: SetLabels = { ...labels, typed: { bank: { category: "power_bank" } } };
    expect(() => typedCategoriesOf(missing, manifest)).toThrow(/no typed category: bank2, shirt/);
    expect(() => typedCategoriesOf({ ...labels, typed: undefined }, manifest)).toThrow(/no typed category: bank, bank2, shirt/);
  });

  it("refuses a typed category the app does not have", () => {
    const bad = { ...labels, typed: { ...labels.typed, shirt: { category: "tshirt" } } } as unknown as SetLabels;
    expect(() => typedCategoriesOf(bad, manifest)).toThrow(/shirt: "tshirt" is not a category/);
  });
});
