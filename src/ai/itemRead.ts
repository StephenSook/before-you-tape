// Reads one item photo by the chosen route (spec 5.3). On "hybrid" a failed or unreadable on-device answer
// is retried in the cloud; on "device_only" the cloud is never called and a reply that came from the cloud
// is thrown away. Cloud network errors, 429 and 5xx get one automatic retry; a 500 or 503 after that
// retry, or a 404 saying the model is gone, gets one try on the fallback model when there is one. The status
// is the SDK's own customErrorData.status, and the number in the error message only when that is missing.
import { parseItemReadWithLabel, type ItemRead } from "../shared/itemRead";
import type { CallOptions, GateState, ImagePart, InferenceSourceName, ItemModels, ModelPort, ModelReply, ReadRoute } from "./port";
import { ITEM_READ_PROMPT } from "./prompts";

export type ReadFailureKind = "blocked" | "device_failed" | "leak_guard" | "cloud_refused" | "cloud_unreachable" | "invalid_output";

export class ReadFailure extends Error {
  override name = "ReadFailure";
  constructor(readonly kind: ReadFailureKind, message: string) {
    super(message);
  }
}

export interface ReadOutcome {
  read: ItemRead;
  // The whole label text the model returned, for label words only: read.labelText is clipped. Memory only.
  fullLabelText?: string;
  source: InferenceSourceName;
  ms: number;
  route: ReadRoute;
  recoveredFrom: string | null;
  unreported?: true; // the SDK named no route; source is in_cloud for privacy
  fallbackAfter?: FallbackAfter; // the fallback model answered after the main cloud model failed with this status
}

// Checks the on-device model at call time, so a model that went away since the page loaded is never asked.
export function guardDevicePort(inner: ModelPort, check: () => Promise<GateState>): ModelPort {
  return {
    async generate(prompt, image) {
      const gate = await check().catch((): GateState => "unavailable");
      if (gate !== "available") throw new ReadFailure("device_failed", `the on-device model is not available (${gate})`);
      return inner.generate(prompt, image);
    },
  };
}

function errorName(e: unknown): string {
  if (e instanceof ReadFailure) return e.kind;
  if (e instanceof Error) return e.name && e.name !== "Error" ? e.name : e.message;
  return String(e);
}

type CloudErrorClass = { kind: "cloud_refused" | "cloud_unreachable"; retry: boolean };

// The error message with any URL taken out: the SDK names the request URL, and a project ID in it is neither a
// status nor a network word.
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/https?:\/\/\S+/g, "");

// The HTTP status of a failed cloud call: the SDK's AIError carries it in customErrorData.status, and when that
// field is set it is the status, whatever the message says. Only without it is the first 4xx or 5xx in the
// message read. A network failure has neither.
export function httpStatus(e: unknown): string | undefined {
  const field = (e as { customErrorData?: { status?: unknown } } | null | undefined)?.customErrorData?.status;
  if (typeof field === "number" && Number.isInteger(field)) return String(field);
  return /\b(4\d\d|5\d\d)\b/.exec(messageOf(e))?.[1];
}

function classifyCloudError(e: unknown): CloudErrorClass {
  const msg = messageOf(e);
  const status = httpStatus(e);
  if (status === "429") return { kind: "cloud_refused", retry: true };
  if (status === "400" || status === "401" || status === "403") return { kind: "cloud_refused", retry: false };
  if (status?.startsWith("5")) return { kind: "cloud_unreachable", retry: true };
  if (/failed to fetch|network|timed? ?out|ECONN|ENOTFOUND|offline/i.test(msg)) return { kind: "cloud_unreachable", retry: true };
  return { kind: "cloud_unreachable", retry: false };
}

// Overloaded or failing servers, and a model the API says is gone: the only answers for which a second
// model is worth one try. A gone model is matched by its message, never by any 404.
const FALLBACK_STATUSES = new Set(["500", "503"]);
const MODEL_GONE = /no longer available|is not found for API version|not supported for generateContent/i;
export type FallbackAfter = "500" | "503" | "404";

function fallbackStatus(e: unknown): FallbackAfter | null {
  const status = httpStatus(e);
  if (status === "404" && MODEL_GONE.test(messageOf(e))) return "404";
  return status && FALLBACK_STATUSES.has(status) ? (status as "500" | "503") : null;
}

interface CloudReply { reply: ModelReply; fallbackAfter?: FallbackAfter }

// Cloud checks can be switched off while a read is running. Each further cloud call (a retry, the fallback
// model, or the cloud recovery of a failed hybrid call) asks first, and every call that can reach the cloud
// carries the check and the read's abort signal, which the page aborts when the cloud is withdrawn. The SDK
// checks that signal before it gets its tokens and before the request, so only a request already sent
// finishes.
export type StillAllowed = () => boolean;
const SWITCHED_OFF = "cloud checks were switched off during the read";
const blocked = () => new ReadFailure("blocked", SWITCHED_OFF);

interface Withdrawal {
  opts: CallOptions; withdrawn: () => boolean; aborted: () => boolean; settle: <T>(call: Promise<T>) => Promise<T>;
  // The cloud is still allowed right now; an abort ends the read instead.
  stillOpen: () => boolean;
}

// A call that can reach the cloud settles as blocked the moment its signal aborts, even while it is still
// waiting (for sign-in, or for the SDK's tokens), so a withdrawn read never leaves the card checking.
function untilAborted<T>(call: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return call;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(blocked());
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
    call.then(
      (v) => { signal.removeEventListener("abort", onAbort); resolve(v); },
      (e: unknown) => { signal.removeEventListener("abort", onAbort); reject(e); },
    );
  });
}

function withdrawal(stillAllowed: StillAllowed, signal?: AbortSignal): Withdrawal {
  const aborted = () => signal?.aborted === true;
  const withdrawn = () => aborted() || !stillAllowed();
  // An abort ends the read (the sender withdrew or left); a "no" from the check only closes the cloud, so
  // a hybrid read can still run on the device.
  const stillOpen = () => {
    if (aborted()) throw blocked();
    return !withdrawn();
  };
  return { opts: signal ? { allowed: stillAllowed, signal } : { allowed: stillAllowed }, aborted, withdrawn, settle: (call) => untilAborted(call, signal), stillOpen };
}

// onEnter: called once, after the first check that the cloud is still allowed and before the first cloud call.
async function callCloud(models: ItemModels, image: ImagePart, w: Withdrawal, onEnter?: () => void): Promise<CloudReply> {
  for (let attempt = 1; ; attempt++) {
    if (!w.stillOpen()) throw blocked();
    if (attempt === 1) onEnter?.();
    try {
      return { reply: await w.settle(models.cloud.generate(ITEM_READ_PROMPT, image, w.opts)) };
    } catch (e) {
      if (w.aborted()) throw blocked();
      const c = classifyCloudError(e);
      if (c.retry && attempt < 2) continue;
      const status = fallbackStatus(e);
      if (!models.fallback || !status) throw new ReadFailure(c.kind, errorName(e));
      if (!w.stillOpen()) throw blocked();
      // One try on the fallback model, with no retry of its own.
      try {
        return { reply: await w.settle(models.fallback.generate(ITEM_READ_PROMPT, image, w.opts)), fallbackAfter: status };
      } catch (f) {
        if (w.aborted()) throw blocked();
        throw new ReadFailure(classifyCloudError(f).kind, errorName(f));
      }
    }
  }
}

function parseOrFail(reply: ModelReply): { read: ItemRead; fullLabelText: string } {
  try {
    return parseItemReadWithLabel(reply.text);
  } catch (e) {
    throw new ReadFailure("invalid_output", errorName(e));
  }
}

// onCloud: called when a hybrid read that did not finish on the device goes on to the cloud, once the cloud is
// confirmed still allowed and before that call, so a page showing where the read runs can say so.
export async function readItem(
  models: ItemModels, image: ImagePart, route: ReadRoute, now: () => number, stillAllowed: StillAllowed = () => true, signal?: AbortSignal,
  onCloud?: () => void,
): Promise<ReadOutcome> {
  const start = now();
  const w = withdrawal(stillAllowed, signal);
  const done = (reply: ModelReply, recoveredFrom: string | null, fallbackAfter?: FallbackAfter, ran: ReadRoute = route): ReadOutcome => {
    const { read, fullLabelText } = parseOrFail(reply);
    const out: ReadOutcome = { read, fullLabelText, source: reply.source, ms: now() - start, route: ran, recoveredFrom };
    if (reply.unreported) out.unreported = true;
    if (fallbackAfter) out.fallbackAfter = fallbackAfter;
    return out;
  };

  if (route === "blocked") throw new ReadFailure("blocked", "no route: the on-device model is not ready and the cloud is not allowed");

  const onDevice = async (): Promise<ReadOutcome> => {
    let reply: ModelReply;
    try {
      reply = await models.device.generate(ITEM_READ_PROMPT, image);
    } catch (e) {
      throw e instanceof ReadFailure ? e : new ReadFailure("device_failed", errorName(e));
    }
    if (reply.source !== "on_device") throw new ReadFailure("leak_guard", `a device-only read came back from ${reply.source}`);
    return done(reply, null, undefined, "device_only");
  };

  if (route === "device_only") return onDevice();

  if (route === "hybrid") {
    // The SDK's hybrid mode may go to the cloud inside the call, so it starts only while the cloud is
    // allowed; otherwise the read stays on the device-only model.
    if (!w.stillOpen()) return onDevice();
    let recoveredFrom: string;
    try {
      const reply = await w.settle(models.hybrid.generate(ITEM_READ_PROMPT, image, w.opts));
      return done(reply, null);
    } catch (e) {
      if (w.aborted()) throw blocked();
      recoveredFrom = errorName(e);
    }
    const cloud = await callCloud(models, image, w, onCloud);
    return done(cloud.reply, recoveredFrom, cloud.fallbackAfter);
  }

  const cloud = await callCloud(models, image, w);
  return done(cloud.reply, null, cloud.fallbackAfter);
}
