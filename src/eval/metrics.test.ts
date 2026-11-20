import { describe, expect, it } from "vitest";
import type { ItemRead } from "../shared/itemRead";
import { clopperPearsonUpper, computeEvalMetrics, percentile, redactRun } from "./metrics";
import type { EvalItem, EvalRow, EvalRun, EvalSet, Level } from "./types";

const provenance = { sourcePage: "https://example.org/p", author: "A", license: "CC0 1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", changes: "resized" };
const item = (itemId: string, hazard: boolean, truth: Record<string, Level>, printed: EvalItem["printed"] = null): EvalItem => ({
  itemId, photo: `/eval/items/${itemId}.jpg`, photoSha256: "0".repeat(64), hazard, printed, provenance,
  truth: Object.fromEntries(Object.entries(truth).map(([d, expected]) => [d, { expected, section: "test" }])),
});
const set = (items: EvalItem[]): EvalSet => ({ setId: "s", manifestSha256: "", protocolSha256: "", destinations: ["CA", "PH"], items });
const read = (patch: Partial<ItemRead> = {}): ItemRead => ({
  itemName: "x", category: "other", labelText: "LABEL WORDS", volts: 0, milliampHours: 0, wattHours: 0, lithiumGrams: 0, batteryWords: false, liquid: false,
  pressurized: false, alcoholOnLabel: false, flammableOnLabel: false, glassContainer: false, powder: false, retailBox: "cannot_tell", evidence: "label_read", ...patch,
});
const row = (itemId: string, destination: string, shipped: Level, o: Partial<EvalRow> = {}): EvalRow => ({
  itemId, destination, device: null, cloud: null, shipped: { level: shipped, source: "on_device", secondLook: false }, ...o,
});
const run = (rows: EvalRow[]): EvalRun => ({ runId: "r", setId: "s", date: "2026-11-22", machine: "m", chromeVersion: "c", modelShown: "gemini", editionId: "e", rows });

const setOneHazardOneBenign = set([item("perfume", true, { CA: "take_out", PH: "take_out" }), item("shirt", false, { CA: "ok", PH: "ok" })]);
const runWith = (levels: Record<string, Record<string, Level>>) =>
  run(Object.entries(levels).flatMap(([itemId, byDest]) => Object.entries(byDest).map(([d, l]) => row(itemId, d, l))));

describe("clopperPearsonUpper", () => {
  it("computes the exact bound", () => {
    expect(clopperPearsonUpper(0, 20, 0.05)).toBeCloseTo(0.139, 3);
    expect(clopperPearsonUpper(0, 40, 0.05)).toBeCloseTo(0.072, 3);
  });

  it("matches the exact bound when some fail, and is 1 when all fail", () => {
    expect(clopperPearsonUpper(1, 20, 0.05)).toBeCloseTo(0.216, 3);
    expect(clopperPearsonUpper(20, 20, 0.05)).toBe(1);
  });
});

describe("computeEvalMetrics", () => {
  it("counts hazard failures per item, not per row", () =>
    expect(computeEvalMetrics(setOneHazardOneBenign, runWith({ perfume: { CA: "ok", PH: "take_out" }, shirt: { CA: "ok", PH: "ok" } })).hazardCalledOk)
      .toMatchObject({ k: 1, n: 1 }));

  it("counts a hazard item called OK in both countries once, over the hazard items, not their rows", () => {
    const twoHazards = set([
      item("perfume", true, { CA: "take_out", PH: "take_out" }), item("bank", true, { CA: "take_out", PH: "take_out" }), item("shirt", false, { CA: "ok", PH: "ok" }),
    ]);
    const m = computeEvalMetrics(twoHazards, runWith({ perfume: { CA: "ok", PH: "ok" }, bank: { CA: "take_out", PH: "check" }, shirt: { CA: "ok", PH: "ok" } }));
    expect(m.hazardCalledOk).toMatchObject({ k: 1, n: 2 });
    expect(m.hazardCalledOk.upper95).toBeCloseTo(clopperPearsonUpper(1, 2, 0.05), 9);
  });

  it("scores agreement with the labels and the check rate per row", () => {
    const m = computeEvalMetrics(setOneHazardOneBenign, runWith({ perfume: { CA: "check", PH: "take_out" }, shirt: { CA: "ok", PH: "check" } }));
    expect(m.truthAgreement).toEqual({ k: 2, n: 4 });
    expect(m.checkRate).toEqual({ k: 2, n: 4 });
    expect(m.hazardCalledOk).toMatchObject({ k: 0, n: 1 });
  });

  it("uses the median of warm runs per crop and pairs the two paths", () => {
    const set2 = set([item("a", false, { CA: "ok" }), item("b", false, { CA: "ok" })]);
    const runMs = (ms: Record<string, { device: number[]; cloud: number[] }>) =>
      run(Object.entries(ms).map(([itemId, m]) => row(itemId, "CA", "ok", { device: { read: read(), msRuns: m.device, level: "ok" }, cloud: { read: read(), msRuns: m.cloud, level: "ok" } })));
    const m = computeEvalMetrics(set2, runMs({ a: { device: [1200, 1300, 9000], cloud: [1500, 1600, 1700] }, b: { device: [1400, 1400, 1400], cloud: [1500, 1500, 1500] } }));
    expect(m.latency.device.p50).toBe(1350);
    expect(m.latency.pairedMedianDiffMs).toBe(-200);
    expect(m.latency.device.n).toBe(2);
    expect(m.latency.diffCi95[0]).toBeLessThanOrEqual(-200);
    expect(m.latency.diffCi95[1]).toBeGreaterThanOrEqual(-200);
  });

  it("checks printed numbers exactly, and counts misreads the cross-check caught", () => {
    const pb = item("pb", true, { CA: "take_out" }, { volts: 3.7, milliampHours: 50000, wattHours: 185 });
    const exact = read({ volts: 3.7, milliampHours: 50000, wattHours: 185 });
    const wrong = read({ volts: 3.7, milliampHours: 5000, wattHours: 185 });
    const r = run([row("pb", "CA", "take_out", { device: { read: wrong, msRuns: [1], level: "check" }, cloud: { read: exact, msRuns: [1], level: "take_out" }, shipped: { level: "take_out", source: "in_cloud", secondLook: true } })]);
    const m = computeEvalMetrics(set([pb]), r);
    expect(m.numbersExact).toEqual({ k: 1, n: 2 });
    expect(m.misreadsCaught).toEqual({ k: 1, n: 1 });
  });
});

describe("percentile", () => {
  it("interpolates between ranks", () => {
    expect(percentile([1300, 1400], 50)).toBe(1350);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBeCloseTo(9.1, 6);
  });
});

describe("redactRun", () => {
  it("redacts label text and item names and keeps the metrics", () => {
    const pb = item("pb", true, { CA: "take_out" }, { volts: 3.7, milliampHours: 50000, wattHours: 185 });
    const set2 = set([pb, item("s", false, { CA: "ok" })]);
    const run2 = run([
      row("pb", "CA", "take_out", { device: { read: read({ itemName: "Power bank", volts: 3.7, milliampHours: 5000, wattHours: 185 }), msRuns: [1200, 1300, 1250], level: "check" }, cloud: { read: read({ volts: 3.7, milliampHours: 50000, wattHours: 185 }), msRuns: [1500, 1600, 1550], level: "take_out" }, shipped: { level: "take_out", source: "in_cloud", secondLook: true } }),
      row("s", "CA", "ok", { device: { read: read({ itemName: "Shirt" }), msRuns: [900, 950, 1000], level: "ok" }, cloud: null }),
    ]);
    const pub = redactRun(run2, set2);
    expect(JSON.stringify(pub)).not.toMatch(/labelText|itemName|LABEL WORDS|Power bank/);
    expect(computeEvalMetrics(set2, pub)).toEqual(computeEvalMetrics(set2, run2));
  });
});
