// One Firebase Performance Monitoring trace per Firebase AI Logic call: where the SDK says the call ran, the mode
// it was asked to run in, the model that route used, how the call ended, and how long it took. AI monitoring in
// the console shows cloud calls only, so this is the only record of on-device calls and their latency. A trace
// never holds the photo, the prompt, the label text or an answer.
import { httpStatus } from "../ai/itemRead";

export const AI_TRACE = "ai_read";

export type AiMode = "only_on_device" | "prefer_on_device" | "only_in_cloud";

// What a call was asked to do: its SDK mode, and the cloud model its in-cloud parameters name ("" when it has none).
export interface AiCall {
  mode: AiMode;
  cloudModel: string;
}

// The browser's own model: the SDK does not say which one it is, so the trace does not either.
export const ON_DEVICE_MODEL = "browser-built-in";

export type AiSource = "on_device" | "in_cloud" | "unreported" | "none";
// refused: the cloud said no (400, 401, 403 or 429, the read pipeline's cloud_refused); withdrawn: the sender
// took the read back; failed: anything else that threw.
export type AiOutcome = "ok" | "failed" | "refused" | "withdrawn";

export interface AiTraceAttributes {
  source: AiSource;
  mode: AiMode;
  model: string;
  outcome: AiOutcome;
}

// What the call came to: the inference source the SDK reported (unknown, as the SDK types it loosely), and the
// error when the call or its reply's text threw.
export interface AiCallResult {
  source?: unknown;
  error?: unknown;
  aborted?: boolean;
}

// Performance Monitoring drops an attribute whose value is empty or longer than 100 characters.
const value = (s: string) => (s ? s.slice(0, 100) : "unknown");

function sourceOf(reported: unknown, threw: boolean): AiSource {
  if (reported === "on_device" || reported === "in_cloud") return reported;
  return threw ? "none" : "unreported";
}

// The model is the route's model: the SDK's report first, then the one place the mode can run, never a guess.
function modelOf(call: AiCall, source: AiSource): string {
  if (source === "on_device") return ON_DEVICE_MODEL;
  if (source === "in_cloud" || call.mode === "only_in_cloud") return value(call.cloudModel);
  if (call.mode === "only_on_device") return ON_DEVICE_MODEL;
  return "unknown";
}

function outcomeOf(r: AiCallResult): AiOutcome {
  if (!("error" in r)) return "ok";
  if (r.aborted) return "withdrawn";
  const status = httpStatus(r.error);
  return status === "400" || status === "401" || status === "403" || status === "429" ? "refused" : "failed";
}

export function aiTraceAttributes(call: AiCall, r: AiCallResult): AiTraceAttributes {
  const source = sourceOf(r.source, "error" in r);
  return { source, mode: call.mode, model: modelOf(call, source), outcome: outcomeOf(r) };
}

// Where traces go: Firebase Performance Monitoring in the app (src/telemetry/perf.ts), a list in tests.
export interface TraceSink {
  record(name: string, startMs: number, durationMs: number, options: { attributes: Record<string, string>; metrics: Record<string, number> }): void;
}

export interface AiCallTrace {
  ok(source: unknown): void;
  failed(error: unknown, aborted: boolean, source?: unknown): void;
}

export interface AiTracer {
  start(call: AiCall): AiCallTrace;
}

export const NO_AI_TRACE: AiTracer = { start: () => ({ ok() {}, failed() {} }) };

export interface TraceClock {
  mono(): number;
  wall(): number;
}

const browserClock: TraceClock = { mono: () => performance.now(), wall: () => Date.now() };

export function aiTracer(sink: TraceSink, clock: TraceClock = browserClock): AiTracer {
  return {
    start(call) {
      const t0 = clock.mono();
      let done = false;
      const record = (r: AiCallResult) => {
        if (done) return;
        done = true;
        // Performance Monitoring refuses a trace whose duration is not above zero, so a call that ended within the same
        // millisecond (one aborted before it started, say) counts as 1 ms instead of being lost.
        const ms = Math.max(1, Math.round(clock.mono() - t0));
        try {
          sink.record(AI_TRACE, Math.round(clock.wall()) - ms, ms, { attributes: { ...aiTraceAttributes(call, r) }, metrics: { latency_ms: ms } });
        } catch {
          // Telemetry never breaks the read it describes: the call already happened and its result stands.
        }
      };
      return {
        ok: (source) => record({ source }),
        failed: (error, aborted, source) => record({ source, error, aborted }),
      };
    },
  };
}
