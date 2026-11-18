import { describe, expect, it, vi } from "vitest";
import type { ItemRead } from "../shared/itemRead";
import { guardDevicePort, readItem } from "./itemRead";
import type { ImagePart, InferenceSourceName, ItemModels, ModelPort } from "./port";

const img: ImagePart = { mimeType: "image/jpeg", base64: "AAAA" };
const validRead: ItemRead = {
  itemName: "Body lotion", category: "lotion_cream", labelText: "SHEA BODY LOTION 8 FL OZ", volts: 0, milliampHours: 0, wattHours: 0,
  lithiumGrams: 0, batteryWords: false, liquid: true, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false,
  glassContainer: false, powder: false, retailBox: "cannot_tell", evidence: "label_read",
};

type MockPort = ModelPort & { generate: ReturnType<typeof vi.fn> };
const text = (t: string, source: InferenceSourceName): MockPort => ({ generate: vi.fn(async () => ({ text: t, source })) });
const ok = (source: InferenceSourceName) => text(JSON.stringify(validRead), source);
// A failure that looks like the SDK's: the name, or the message when there is no special name.
const fails = (what: string): MockPort => ({
  generate: vi.fn(async () => {
    const e = new Error(what);
    if (/^[A-Z][A-Za-z]+Error$/.test(what)) e.name = what;
    throw e;
  }),
});
const never = (): MockPort => ({ generate: vi.fn(async () => { throw new Error("this port must not be called"); }) });
const models = (m: Partial<Record<keyof ItemModels, MockPort>>) => ({ device: never(), hybrid: never(), cloud: never(), ...m }) as ItemModels & Record<keyof ItemModels, MockPort>;
// A clock that returns these times in order, then repeats the last.
const clock = (...times: number[]) => { let i = 0; return () => times[Math.min(i++, times.length - 1)] as number; };

describe("guardDevicePort", () => {
  it("makes no SDK call when the device check fails at call time", async () => {
    const inner = { generate: vi.fn() };
    const guarded = guardDevicePort(inner, async () => "no_api");
    await expect(guarded.generate("p", img)).rejects.toMatchObject({ kind: "device_failed" });
    expect(inner.generate).not.toHaveBeenCalled();
  });

  it("calls through when the model is available", async () => {
    const guarded = guardDevicePort(ok("on_device"), async () => "available");
    await expect(guarded.generate("p", img)).resolves.toMatchObject({ source: "on_device" });
  });
});

describe("readItem", () => {
  it("returns the on-device read with its time", async () =>
    expect(await readItem(models({ hybrid: ok("on_device") }), img, "hybrid", clock(0, 1300))).toMatchObject({ source: "on_device", ms: 1300, recoveredFrom: null, route: "hybrid", read: validRead }));

  it("retries in the cloud on a throw or bad JSON", async () => {
    expect(await readItem(models({ hybrid: fails("QuotaExceededError"), cloud: ok("in_cloud") }), img, "hybrid", clock(0, 2))).toMatchObject({ source: "in_cloud", recoveredFrom: "QuotaExceededError" });
    expect((await readItem(models({ hybrid: text("oops", "on_device"), cloud: ok("in_cloud") }), img, "hybrid", clock(0, 2))).recoveredFrom).toBe("invalid_output");
  });

  it("carries a reply that named no route into the outcome, and leaves named routes unmarked", async () => {
    const unreported: MockPort = { generate: vi.fn(async () => ({ text: JSON.stringify(validRead), source: "in_cloud" as const, unreported: true as const })) };
    expect(await readItem(models({ cloud: unreported }), img, "cloud_only", clock(0, 5))).toMatchObject({ source: "in_cloud", unreported: true });
    expect(await readItem(models({ cloud: ok("in_cloud") }), img, "cloud_only", clock(0, 5))).not.toHaveProperty("unreported");
  });

  it("never calls the cloud on device_only and discards a cloud-sourced reply", async () => {
    const m = models({ device: fails("NotSupportedError"), cloud: ok("in_cloud") });
    await expect(readItem(m, img, "device_only", clock(0, 1))).rejects.toMatchObject({ kind: "device_failed" });
    expect(m.cloud.generate).not.toHaveBeenCalled();
    await expect(readItem(models({ device: ok("in_cloud") }), img, "device_only", clock(0, 1))).rejects.toMatchObject({ kind: "leak_guard" });
  });

  it("maps cloud failures and blocked", async () => {
    await expect(readItem(models({ cloud: fails("fetch-error 403") }), img, "cloud_only", clock(0, 1))).rejects.toMatchObject({ kind: "cloud_refused" });
    await expect(readItem(models({ cloud: fails("Failed to fetch") }), img, "cloud_only", clock(0, 1))).rejects.toMatchObject({ kind: "cloud_unreachable" });
    await expect(readItem(models({}), img, "blocked", clock(0, 1))).rejects.toMatchObject({ kind: "blocked" });
  });

  it("retries a network error, a 429 or a 5xx once before failing, and never retries a refusal", async () => {
    const flaky = models({ cloud: { generate: vi.fn().mockRejectedValueOnce(new Error("Failed to fetch")).mockResolvedValueOnce({ text: JSON.stringify(validRead), source: "in_cloud" }) } });
    expect(await readItem(flaky, img, "cloud_only", clock(0, 5))).toMatchObject({ source: "in_cloud" });
    expect(flaky.cloud.generate).toHaveBeenCalledTimes(2);
    for (const msg of ["fetch-error 429 Too Many Requests", "fetch-error 503"]) {
      const m = models({ cloud: fails(msg) });
      await expect(readItem(m, img, "cloud_only", clock(0, 1))).rejects.toBeTruthy();
      expect(m.cloud.generate, msg).toHaveBeenCalledTimes(2);
    }
    const refused = models({ cloud: fails("fetch-error 403") });
    await expect(readItem(refused, img, "cloud_only", clock(0, 1))).rejects.toMatchObject({ kind: "cloud_refused" });
    expect(refused.cloud.generate).toHaveBeenCalledTimes(1);
  });

  it("calls invalid cloud output invalid_output", async () =>
    expect(readItem(models({ cloud: text("{\"itemName\":1}", "in_cloud") }), img, "cloud_only", clock(0, 1))).rejects.toMatchObject({ kind: "invalid_output" }));
});
