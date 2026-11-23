import type { FirebaseApp } from "firebase/app";
import { describe, expect, it, vi } from "vitest";
import { NO_AI_TRACE, type TraceSink } from "./aiTrace";
import { appAiTracer, perfSink, type PerfModule } from "./perf";

const app = { name: "[DEFAULT]" } as FirebaseApp;
const flush = () => new Promise((r) => setTimeout(r, 0));
const options = { attributes: { source: "on_device" }, metrics: { latency_ms: 812 } };

function fakeModule() {
  const record = vi.fn();
  const perf = { instance: "perf" };
  const m = { initializePerformance: vi.fn(() => perf), trace: vi.fn(() => ({ record })) };
  return { m: m as unknown as PerfModule & typeof m, record, perf };
}

describe("perfSink", () => {
  it("loads Performance Monitoring on the first trace only, with its automatic page and network traces off", async () => {
    const { m, record, perf } = fakeModule();
    const load = vi.fn(async () => m);
    const sink = perfSink(app, load);
    expect(load).not.toHaveBeenCalled();
    sink.record("ai_read", 1000, 812, options);
    sink.record("ai_read", 2000, 90, options);
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(m.initializePerformance).toHaveBeenCalledExactlyOnceWith(app, { instrumentationEnabled: false });
    expect(m.trace).toHaveBeenCalledWith(perf, "ai_read");
    expect(record.mock.calls).toEqual([[1000, 812, options], [2000, 90, options]]);
  });

  it("drops a trace it cannot send and never throws into the caller", async () => {
    const failing = perfSink(app, async () => { throw new Error("chunk failed to load"); });
    expect(() => failing.record("ai_read", 1, 1, options)).not.toThrow();
    const { m } = fakeModule();
    m.initializePerformance.mockImplementation(() => { throw new Error("unsupported browser"); });
    const broken = perfSink(app, async () => m);
    expect(() => broken.record("ai_read", 1, 1, options)).not.toThrow();
    await flush();
  });
});

describe("appAiTracer", () => {
  const call = { mode: "only_in_cloud", cloudModel: "gemini-3.5-flash-lite" } as const;

  it("sends real reads to Performance Monitoring", () => {
    const record = vi.fn();
    const sink: TraceSink = { record };
    const tracer = appAiTracer(app, { emulators: false, automated: false }, () => sink);
    tracer.start(call).ok("in_cloud");
    expect(record).toHaveBeenCalledOnce();
  });

  it("sends nothing from an emulator build or an automated browser, so test runs never mix into real reads", () => {
    const make = vi.fn((): TraceSink => ({ record: vi.fn() }));
    expect(appAiTracer(app, { emulators: true, automated: false }, make)).toBe(NO_AI_TRACE);
    expect(appAiTracer(app, { emulators: false, automated: true }, make)).toBe(NO_AI_TRACE);
    expect(make).not.toHaveBeenCalled();
  });
});
