import { describe, expect, it } from "vitest";
import { ReadFailure } from "../ai/itemRead";
import { AI_TRACE, aiTraceAttributes, aiTracer, NO_AI_TRACE, ON_DEVICE_MODEL, type AiCall, type TraceSink } from "./aiTrace";

const cloud: AiCall = { mode: "only_in_cloud", cloudModel: "gemini-3.5-flash-lite" };
const hybrid: AiCall = { mode: "prefer_on_device", cloudModel: "gemini-3.5-flash-lite" };
const device: AiCall = { mode: "only_on_device", cloudModel: "" };

// An SDK error the way firebase/ai builds one: the HTTP status in customErrorData.status.
const httpError = (status: number) => Object.assign(new Error(`[${status}] request failed`), { customErrorData: { status } });

describe("aiTraceAttributes", () => {
  it("names the route the SDK reported, and the model that route used", () => {
    expect(aiTraceAttributes(hybrid, { source: "on_device" })).toEqual({ source: "on_device", mode: "prefer_on_device", model: ON_DEVICE_MODEL, outcome: "ok" });
    expect(aiTraceAttributes(hybrid, { source: "in_cloud" })).toEqual({ source: "in_cloud", mode: "prefer_on_device", model: "gemini-3.5-flash-lite", outcome: "ok" });
  });

  it("never guesses a route the SDK did not name", () => {
    expect(aiTraceAttributes(hybrid, { source: undefined })).toMatchObject({ source: "unreported", model: "unknown" });
    expect(aiTraceAttributes(hybrid, { source: "somewhere_new" })).toMatchObject({ source: "unreported", model: "unknown" });
    // A mode that can run in one place only names that place's model, whatever the SDK reported.
    expect(aiTraceAttributes(cloud, { source: undefined })).toMatchObject({ source: "unreported", model: "gemini-3.5-flash-lite" });
    expect(aiTraceAttributes(device, { source: undefined })).toMatchObject({ source: "unreported", model: ON_DEVICE_MODEL });
  });

  it("marks a call that threw: refused when the cloud said no, withdrawn when the read was taken back, failed otherwise", () => {
    for (const status of [400, 401, 403, 429]) {
      expect(aiTraceAttributes(cloud, { error: httpError(status) }), String(status)).toEqual({ source: "none", mode: "only_in_cloud", model: "gemini-3.5-flash-lite", outcome: "refused" });
    }
    for (const status of [404, 500, 503]) expect(aiTraceAttributes(cloud, { error: httpError(status) }).outcome, String(status)).toBe("failed");
    expect(aiTraceAttributes(cloud, { error: new TypeError("Failed to fetch") }).outcome).toBe("failed");
    expect(aiTraceAttributes(device, { error: new Error("the model could not start") })).toEqual({ source: "none", mode: "only_on_device", model: ON_DEVICE_MODEL, outcome: "failed" });
    expect(aiTraceAttributes(hybrid, { error: new ReadFailure("blocked", "switched off"), aborted: true })).toEqual({ source: "none", mode: "prefer_on_device", model: "unknown", outcome: "withdrawn" });
  });

  it("keeps the route of a reply whose text could not be read", () => {
    expect(aiTraceAttributes(hybrid, { source: "in_cloud", error: new Error("blocked by safety") })).toEqual({ source: "in_cloud", mode: "prefer_on_device", model: "gemini-3.5-flash-lite", outcome: "failed" });
  });

  it("gives Performance Monitoring only values it accepts: never empty, at most 100 characters", () => {
    expect(aiTraceAttributes({ mode: "only_in_cloud", cloudModel: "" }, { source: "in_cloud" }).model).toBe("unknown");
    expect(aiTraceAttributes({ mode: "only_in_cloud", cloudModel: "m".repeat(130) }, { source: "in_cloud" }).model).toHaveLength(100);
  });
});

describe("aiTracer", () => {
  const recording = () => {
    const calls: { name: string; start: number; duration: number; options: unknown }[] = [];
    const sink: TraceSink = { record: (name, start, duration, options) => { calls.push({ name, start, duration, options }); } };
    return { calls, sink };
  };

  it("records one trace per call with its latency, ended at the wall-clock time the call ended", () => {
    const { calls, sink } = recording();
    let mono = 1_000;
    const tracer = aiTracer(sink, { mono: () => mono, wall: () => 1_700_000_000_000 });
    const t = tracer.start(hybrid);
    mono += 812.4;
    t.ok("on_device");
    expect(calls).toEqual([{
      name: AI_TRACE,
      start: 1_700_000_000_000 - 812,
      duration: 812,
      options: { attributes: { source: "on_device", mode: "prefer_on_device", model: ON_DEVICE_MODEL, outcome: "ok" }, metrics: { latency_ms: 812 } },
    }]);
  });

  it("records a failed call once, and nothing more if the call is reported twice", () => {
    const { calls, sink } = recording();
    const tracer = aiTracer(sink, { mono: () => 5, wall: () => 10 });
    const t = tracer.start(cloud);
    t.failed(httpError(429), false);
    t.ok("in_cloud");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.options).toMatchObject({ attributes: { outcome: "refused", source: "none" } });
  });

  it("never throws into the read when telemetry fails", () => {
    const tracer = aiTracer({ record: () => { throw new Error("performance monitoring is off"); } });
    expect(() => tracer.start(cloud).ok("in_cloud")).not.toThrow();
    expect(() => tracer.start(cloud).failed(new Error("x"), false)).not.toThrow();
  });

  it("has a tracer that records nothing, for builds and tools that send no telemetry", () => {
    expect(() => NO_AI_TRACE.start(cloud).ok("in_cloud")).not.toThrow();
  });
});
