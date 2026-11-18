// Reads one item photo by the chosen route (spec 5.3). On "hybrid" a failed or unreadable on-device answer
// is retried in the cloud; on "device_only" the cloud is never called and a reply that came from the cloud
// is thrown away. Cloud network errors, 429 and 5xx get one automatic retry.
import { parseItemRead, type ItemRead } from "../shared/itemRead";
import type { GateState, ImagePart, InferenceSourceName, ItemModels, ModelPort, ModelReply, ReadRoute } from "./port";
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
  source: InferenceSourceName;
  ms: number;
  route: ReadRoute;
  recoveredFrom: string | null;
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

function classifyCloudError(e: unknown): CloudErrorClass {
  const msg = e instanceof Error ? e.message : String(e);
  const status = /\b(4\d\d|5\d\d)\b/.exec(msg)?.[1];
  if (status === "429") return { kind: "cloud_refused", retry: true };
  if (status === "400" || status === "401" || status === "403") return { kind: "cloud_refused", retry: false };
  if (status?.startsWith("5")) return { kind: "cloud_unreachable", retry: true };
  if (/failed to fetch|network|timed? ?out|ECONN|ENOTFOUND|offline/i.test(msg)) return { kind: "cloud_unreachable", retry: true };
  return { kind: "cloud_unreachable", retry: false };
}

async function callCloud(cloud: ModelPort, image: ImagePart): Promise<ModelReply> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await cloud.generate(ITEM_READ_PROMPT, image);
    } catch (e) {
      const c = classifyCloudError(e);
      if (!c.retry || attempt >= 2) throw new ReadFailure(c.kind, errorName(e));
    }
  }
}

function parseOrFail(reply: ModelReply): ItemRead {
  try {
    return parseItemRead(reply.text);
  } catch (e) {
    throw new ReadFailure("invalid_output", errorName(e));
  }
}

export async function readItem(models: ItemModels, image: ImagePart, route: ReadRoute, now: () => number): Promise<ReadOutcome> {
  const start = now();
  const done = (read: ItemRead, source: InferenceSourceName, recoveredFrom: string | null): ReadOutcome =>
    ({ read, source, ms: now() - start, route, recoveredFrom });

  if (route === "blocked") throw new ReadFailure("blocked", "no route: the on-device model is not ready and the cloud is not allowed");

  if (route === "device_only") {
    let reply: ModelReply;
    try {
      reply = await models.device.generate(ITEM_READ_PROMPT, image);
    } catch (e) {
      throw e instanceof ReadFailure ? e : new ReadFailure("device_failed", errorName(e));
    }
    if (reply.source !== "on_device") throw new ReadFailure("leak_guard", `a device-only read came back from ${reply.source}`);
    return done(parseOrFail(reply), "on_device", null);
  }

  if (route === "hybrid") {
    let recoveredFrom: string;
    try {
      const reply = await models.hybrid.generate(ITEM_READ_PROMPT, image);
      return done(parseOrFail(reply), reply.source, null);
    } catch (e) {
      recoveredFrom = errorName(e);
    }
    const reply = await callCloud(models.cloud, image);
    return done(parseOrFail(reply), reply.source, recoveredFrom);
  }

  const reply = await callCloud(models.cloud, image);
  return done(parseOrFail(reply), reply.source, null);
}
