import { expect, it, vi } from "vitest";
import { SAMPLE_READ } from "../data/sampleRead";
import { bridgeParentsFromPolicy, handleBridgeMessage, isAllowedParent, isBridgeRequest } from "./protocol";

const parent = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ping = { v: 1, id: "test-1", kind: "ping" } as const;
const req = { ...ping, kind: "product_read", text: "Unscented lotion" } as const;

function setup() {
  const generate = vi.fn(async () => ({
    text: JSON.stringify({ ...SAMPLE_READ.read, wattHours: 99, evidence: "label_read" }),
    source: "in_cloud" as const,
  }));
  return { allowed: [parent], cloud: { generate }, killCloud: false, sha: "test-sha" };
}

it("ignores a message from any other origin and calls no model", async () => {
  const deps = setup();
  expect(await handleBridgeMessage({ origin: "https://elsewhere.example", data: req }, deps)).toBeNull();
  expect(deps.cloud.generate).not.toHaveBeenCalled();
});

it("refuses long text, unknown kinds and extra keys", () => {
  expect(isBridgeRequest(req)).toBe(true);
  expect(isBridgeRequest({ ...req, text: "a".repeat(2001) })).toBe(false);
  expect(isBridgeRequest({ ...req, text: "  " })).toBe(false);
  expect(isBridgeRequest({ ...req, kind: "run" })).toBe(false);
  expect(isBridgeRequest({ ...req, extra: 1 })).toBe(false);
  expect(isBridgeRequest({ ...ping, text: "x" })).toBe(false);
});

it("matches the parent origin exactly and defaults to no parents", () => {
  expect(isAllowedParent(parent, [parent])).toBe(true);
  expect(isAllowedParent(parent + "a", [parent])).toBe(false);
  expect(isAllowedParent(parent, [])).toBe(false);
  expect(bridgeParentsFromPolicy("frame-ancestors 'none'")).toEqual([]);
  expect(bridgeParentsFromPolicy("frame-ancestors *")).toEqual([]);
  expect(bridgeParentsFromPolicy("frame-ancestors " + parent + " https://elsewhere.example")).toEqual([]);
  expect(bridgeParentsFromPolicy("frame-ancestors " + parent)).toEqual([parent]);
});

it("answers a ping with the build SHA and calls no model", async () => {
  const deps = setup();
  expect(await handleBridgeMessage({ origin: parent, data: ping }, deps))
    .toEqual({ v: 1, id: ping.id, ok: true, kind: "pong", sha: "test-sha" });
  expect(deps.cloud.generate).not.toHaveBeenCalled();
});

it("answers cloud_paused when the cloud is paused, with no model call", async () => {
  const deps = { ...setup(), killCloud: true };
  expect(await handleBridgeMessage({ origin: parent, data: req }, deps))
    .toMatchObject({ ok: false, failure: "cloud_paused" });
  expect(deps.cloud.generate).not.toHaveBeenCalled();
});

it("returns only item fields from a valid cloud read", async () => {
  const deps = setup();
  const reply = await handleBridgeMessage({ origin: parent, data: req }, deps);
  expect(deps.cloud.generate).toHaveBeenCalledExactlyOnceWith(JSON.stringify(req.text), undefined, undefined);
  expect(reply).toMatchObject({ id: req.id, ok: true, kind: "product_read", source: "in_cloud" });
  expect(reply?.ok && reply.kind === "product_read" && JSON.parse(reply.text))
    .toMatchObject({ wattHours: 0, evidence: "item_seen" });
});
