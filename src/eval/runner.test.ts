import { describe, expect, it, vi } from "vitest";
import { ed } from "../../tests/engine/helpers";
import type { ImagePart, ItemModels, ModelPort } from "../ai/port";
import type { ItemRead } from "../shared/itemRead";
import { evalRows } from "./runner";
import type { EvalSet } from "./types";

const base: ItemRead = {
  itemName: "Body lotion", category: "lotion_cream", labelText: "SHEA BODY LOTION 8 FL OZ", volts: 0, milliampHours: 0, wattHours: 0,
  lithiumGrams: 0, batteryWords: false, liquid: true, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false,
  glassContainer: false, powder: false, retailBox: "cannot_tell", evidence: "label_read",
};
// 3.7 V x 2500 mAh is 9.25 Wh, more than 3 percent from the printed 9.62: a Wh mismatch, which gets a second look.
const phoneDevice: ItemRead = { ...base, itemName: "Phone", category: "phone", labelText: "LI-ION 3.7V 2500mAh 9.62Wh", liquid: false,
  volts: 3.7, milliampHours: 2500, wattHours: 9.62, batteryWords: true };
const phoneCloud: ItemRead = { ...phoneDevice, labelText: "LI-ION 3.7V 2600mAh 9.62Wh", milliampHours: 2600 };

type Spy = ModelPort & { generate: ReturnType<typeof vi.fn> };
const answers = (read: ItemRead, source: "on_device" | "in_cloud"): Spy => ({ generate: vi.fn(async () => ({ text: JSON.stringify(read), source })) });
const failing = (msg: string): Spy => ({ generate: vi.fn(async () => { throw new Error(msg); }) });

const set = (itemIds: string[]): EvalSet => ({
  setId: "set-1", manifestSha256: "m", protocolSha256: "p", destinations: ["CA", "PH"],
  items: itemIds.map((itemId) => ({
    itemId, photo: `/eval/items/${itemId}.jpg`, photoSha256: "s", hazard: false, printed: null,
    truth: { CA: { expected: "ok", section: "x" }, PH: { expected: "take_out", section: "x" } },
    provenance: { sourcePage: "", author: "", license: "", licenseUrl: "", changes: "" },
  })),
});
const image: ImagePart = { mimeType: "image/jpeg", base64: "/9j/AAAA" };
let t = 0;
const now = () => (t += 100);

describe("evalRows", () => {
  it("reads each item on the device, in the cloud and on the shipped route, and judges each read for every destination", async () => {
    const models: ItemModels & Record<"device" | "hybrid" | "cloud", Spy> = { device: answers(base, "on_device"), hybrid: answers(base, "on_device"), cloud: answers(base, "in_cloud") };
    const out = await evalRows({ set: set(["own-18"]), edition: ed, date: "2026-11-21", models, images: { "own-18": image }, now });
    expect(out.failures).toEqual([]);
    expect(out.rows.map((r) => r.destination)).toEqual(["CA", "PH"]);
    // Each path used only its own model, once.
    expect(models.device.generate).toHaveBeenCalledTimes(1);
    expect(models.cloud.generate).toHaveBeenCalledTimes(1);
    expect(models.hybrid.generate).toHaveBeenCalledTimes(1);
    const [ca, ph] = out.rows;
    // A liquid lotion: OK for Canada, out for the Philippines, on every path, judged by the app's own box store.
    expect([ca!.device!.level, ca!.cloud!.level, ca!.shipped.level]).toEqual(["ok", "ok", "ok"]);
    expect([ph!.device!.level, ph!.cloud!.level, ph!.shipped.level]).toEqual(["take_out", "take_out", "take_out"]);
    expect(ca!.shipped).toMatchObject({ source: "on_device", secondLook: false });
    expect(ca!.device!.read.category).toBe("lotion_cream");
    expect(ca!.device!.msRuns).toHaveLength(1);
  });

  it("runs the app's second look on the shipped route when an on-device read needs one", async () => {
    const models: ItemModels & Record<"device" | "hybrid" | "cloud", Spy> = { device: answers(phoneDevice, "on_device"), hybrid: answers(phoneDevice, "on_device"), cloud: answers(phoneCloud, "in_cloud") };
    const out = await evalRows({ set: set(["own-01"]), edition: ed, date: "2026-11-21", models, images: { "own-01": image }, now });
    expect(out.rows[0]!.shipped).toMatchObject({ source: "on_device", secondLook: true });
    // The cloud path's own read plus the second look on the shipped route.
    expect(models.cloud.generate).toHaveBeenCalledTimes(2);
  });

  it("records a failed path instead of guessing, and the shipped route as Check this when its read fails", async () => {
    const models = { device: failing("no device model"), hybrid: failing("no device model"), cloud: failing("Failed to fetch") };
    const out = await evalRows({ set: set(["own-18"]), edition: ed, date: "2026-11-21", models, images: { "own-18": image }, now });
    expect(out.rows[0]!.device).toBeNull();
    expect(out.rows[0]!.cloud).toBeNull();
    expect(out.rows[0]!.shipped).toEqual({ level: "check", source: "failed", secondLook: false });
    expect(out.failures.map((f) => `${f.itemId}:${f.path}`)).toEqual(["own-18:device", "own-18:cloud", "own-18:shipped"]);
  });

  it("lets the shipped route recover in the cloud as the app does when the hybrid call fails", async () => {
    const models = { device: answers(base, "on_device"), hybrid: failing("Failed to fetch"), cloud: answers(base, "in_cloud") };
    const out = await evalRows({ set: set(["own-18"]), edition: ed, date: "2026-11-21", models, images: { "own-18": image }, now });
    expect(out.failures).toEqual([]);
    expect(out.rows[0]!.shipped).toMatchObject({ level: "ok", source: "in_cloud" });
  });

  it("times each path as many times as asked, keeping the first read", async () => {
    const models = { device: answers(base, "on_device"), hybrid: answers(base, "on_device"), cloud: answers(base, "in_cloud") };
    const out = await evalRows({ set: set(["own-18"]), edition: ed, date: "2026-11-21", models, images: { "own-18": image }, now, repeat: 3 });
    expect(out.rows[0]!.device!.msRuns).toHaveLength(3);
    expect(out.rows[0]!.cloud!.msRuns).toHaveLength(3);
    expect(models.device.generate).toHaveBeenCalledTimes(3);
  });

  it("refuses an item with no photo", async () => {
    const models = { device: answers(base, "on_device"), hybrid: answers(base, "on_device"), cloud: answers(base, "in_cloud") };
    await expect(evalRows({ set: set(["own-18"]), edition: ed, date: "2026-11-21", models, images: {}, now })).rejects.toThrow(/own-18: no photo/);
  });
});
