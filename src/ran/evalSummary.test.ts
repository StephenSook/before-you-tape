import { describe, expect, it } from "vitest";
import committed from "./eval.json";
import { readEval, summarizeEval } from "./evalSummary";

const shipped = (source: string, secondLook: boolean) => ({ level: "ok", source, secondLook, numbersExact: true, msRuns: [1, 2, 3] });
const run = () => ({
  runId: "models-2026-11-21",
  date: "2026-11-21",
  machine: "A laptop",
  chromeVersion: "157.0",
  modelShown: "device: built-in; cloud: a model",
  editionId: "byt-abc",
  rows: [
    { itemId: "a", destination: "CA", shipped: shipped("on_device", true) },
    { itemId: "a", destination: "PH", shipped: shipped("on_device", true) },
    { itemId: "b", destination: "CA", shipped: shipped("on_device", false) },
    { itemId: "b", destination: "PH", shipped: shipped("in_cloud", false) },
  ],
  metrics: {
    allItems: {
      items: 2,
      truthAgreement: { k: 3, n: 4 },
      hazardCalledOk: { k: 0, n: 2, upper95: 0.7 },
      checkRate: { k: 1, n: 4 },
      latency: { shipped: { p50: 4867.5, p90: 7734.8, n: 2 } },
    },
    withoutRuleChangeItems: {
      items: 1,
      truthAgreement: { k: 2, n: 2 },
      hazardCalledOk: { k: 0, n: 1, upper95: 0.95 },
      checkRate: { k: 0, n: 2 },
      latency: { shipped: { p50: 4000, p90: 5000, n: 1 } },
    },
  },
});

describe("summarizeEval", () => {
  it("summarizes the shipped route of a model run: where each check was read, second looks, safety and time", () => {
    expect(summarizeEval(run(), "eval/runs/models-2026-11-21.public.json")).toEqual({
      runId: "models-2026-11-21",
      date: "2026-11-21",
      machine: "A laptop",
      chrome: "157.0",
      models: "device: built-in; cloud: a model",
      editionId: "byt-abc",
      source: "eval/runs/models-2026-11-21.public.json",
      items: 2,
      destinations: 2,
      checks: 4,
      readOnDevice: 3,
      secondLookItems: 1,
      agreement: { k: 3, n: 4 },
      hazardsCalledOk: { k: 0, n: 2 },
      checkThis: { k: 1, n: 4 },
      p50Ms: 4868,
      p90Ms: 7735,
      withoutRuleChanges: { items: 1, agreement: { k: 2, n: 2 }, hazardsCalledOk: { k: 0, n: 1 } },
    });
  });

  it("refuses a run it cannot read rather than summarize part of it", () => {
    expect(() => summarizeEval({ ...run(), rows: "x" }, "s")).toThrow();
    expect(() => summarizeEval({ ...run(), metrics: {} }, "s")).toThrow();
    // The numbers without the items that prompted a rule change are required, and cover fewer items than the run.
    expect(() => summarizeEval({ ...run(), metrics: { allItems: run().metrics.allItems } }, "s")).toThrow();
    expect(() => summarizeEval({ ...run(), metrics: { ...run().metrics, withoutRuleChangeItems: { ...run().metrics.withoutRuleChangeItems, items: 3 } } }, "s")).toThrow();
    expect(() => summarizeEval(null, "s")).toThrow();
  });
});

describe("readEval", () => {
  it("accepts the committed summary", () => {
    expect(readEval(committed)).toEqual({ ok: true, data: committed });
  });

  it("refuses a summary it cannot read: missing or extra fields, a wrong type, k over n, more on the device than checks", () => {
    const cases: unknown[] = [
      null, "x", {},
      { ...committed, agreement: undefined },
      { ...committed, extra: 1 },
      { ...committed, checks: "80" },
      { ...committed, date: "21 Nov" },
      { ...committed, hazardsCalledOk: { k: 29, n: 28 } },
      { ...committed, readOnDevice: 81 },
      { ...committed, p90Ms: 1 },
      { ...committed, withoutRuleChanges: undefined },
      { ...committed, withoutRuleChanges: { ...committed.withoutRuleChanges, extra: 1 } },
      { ...committed, withoutRuleChanges: { ...committed.withoutRuleChanges, items: 41 } },
      { ...committed, withoutRuleChanges: { ...committed.withoutRuleChanges, agreement: { k: 77, n: 76 } } },
      { ...committed, withoutRuleChanges: { ...committed.withoutRuleChanges, hazardsCalledOk: { k: 0, n: "26" } } },
    ];
    for (const c of cases) expect(readEval(c), JSON.stringify(c)).toEqual({ ok: false });
  });
});
