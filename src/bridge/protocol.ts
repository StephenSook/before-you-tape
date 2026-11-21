import { ReadFailure } from "../ai/itemRead";
import type { InferenceSourceName, ModelPort } from "../ai/port";
import { PRODUCT_TEXT_MAX, readProductText } from "../ai/productText";

export const BRIDGE_PATH = "/ext-bridge.html";

const failures = ["bad_request", "not_allowed", "cloud_paused", "cloud_refused", "cloud_unreachable", "invalid_output"] as const;
type BridgeFailure = (typeof failures)[number];
type Envelope = { v: 1; id: string };
export type BridgeRequest = Envelope & ({ kind: "ping" } | { kind: "product_read"; text: string });
export type BridgeReply = Envelope & (
  | { ok: true; kind: "pong"; sha: string }
  | { ok: true; kind: "product_read"; text: string; source: InferenceSourceName }
  | { ok: false; failure: BridgeFailure }
);

type RecordValue = Record<string, unknown>;
const record = (v: unknown): v is RecordValue => typeof v === "object" && v !== null && !Array.isArray(v);
const validId = (id: unknown): id is string => typeof id === "string" && /^[a-z0-9-]{1,80}$/i.test(id);
const keysMatch = (value: RecordValue, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

export function isBridgeRequest(value: unknown): value is BridgeRequest {
  if (!record(value) || value.v !== 1 || !validId(value.id)) return false;
  if (value.kind === "ping") return keysMatch(value, ["v", "id", "kind"]);
  return value.kind === "product_read" && keysMatch(value, ["v", "id", "kind", "text"])
    && typeof value.text === "string" && value.text.length <= PRODUCT_TEXT_MAX && value.text.trim() !== "";
}

export function isBridgeReply(value: unknown): value is BridgeReply {
  if (!record(value) || value.v !== 1 || !validId(value.id)) return false;
  if (value.ok === false) {
    return keysMatch(value, ["v", "id", "ok", "failure"]) && failures.some((failure) => failure === value.failure);
  }
  if (value.ok !== true) return false;
  if (value.kind === "pong") {
    return keysMatch(value, ["v", "id", "ok", "kind", "sha"]) && typeof value.sha === "string" && value.sha !== "";
  }
  return value.kind === "product_read" && keysMatch(value, ["v", "id", "ok", "kind", "text", "source"])
    && typeof value.text === "string" && (value.source === "in_cloud" || value.source === "on_device");
}

export function isAllowedParent(origin: string, allowed: readonly string[]): boolean {
  return allowed.includes(origin);
}

// Hosting and the message handler use the same policy. An absent or malformed policy opens no door.
export function bridgeParentsFromPolicy(policy: string): string[] {
  const [directive, ...origins] = policy.trim().split(/\s+/);
  return directive === "frame-ancestors" && origins.every((origin) => /^chrome-extension:\/\/[a-p]{32}$/.test(origin))
    ? origins : [];
}

export async function handleBridgeMessage(
  event: { origin: string; data: unknown },
  deps: { allowed: readonly string[]; cloud: ModelPort; killCloud: boolean; sha: string; signal?: AbortSignal },
): Promise<BridgeReply | null> {
  if (!isAllowedParent(event.origin, deps.allowed)) return null;
  const request = event.data;
  if (!isBridgeRequest(request)) {
    return record(request) && request.v === 1 && validId(request.id)
      ? { v: 1, id: request.id, ok: false, failure: "bad_request" } : null;
  }
  const envelope = { v: 1, id: request.id } as const;
  if (request.kind === "ping") return { ...envelope, ok: true, kind: "pong", sha: deps.sha };
  if (deps.killCloud) return { ...envelope, ok: false, failure: "cloud_paused" };

  try {
    const { read, source } = await readProductText(
      deps.cloud, request.text, "in_cloud", performance.now.bind(performance),
      deps.signal ? { signal: deps.signal } : undefined,
    );
    return { ...envelope, ok: true, kind: "product_read", text: JSON.stringify(read), source };
  } catch (error) {
    const kind = error instanceof ReadFailure ? error.kind : null;
    let failure: BridgeFailure = "cloud_unreachable";
    if (kind === "blocked") failure = "cloud_paused";
    else if (kind === "invalid_output" || kind === "leak_guard") failure = "invalid_output";
    else if (kind === "cloud_refused" || (error instanceof Error && /\b(?:400|401|403|429)\b/.test(error.message))) {
      failure = "cloud_refused";
    }
    return { ...envelope, ok: false, failure };
  }
}
