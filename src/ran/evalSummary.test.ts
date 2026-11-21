import { describe, expect, it } from "vitest";
import { summarizeEval } from "./evalSummary";

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
    });
  });

  it("refuses a run it cannot read rather than summarize part of it", () => {
    expect(() => summarizeEval({ ...run(), rows: "x" }, "s")).toThrow();
    expect(() => summarizeEval({ ...run(), metrics: {} }, "s")).toThrow();
    expect(() => summarizeEval(null, "s")).toThrow();
  });
});
