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

  it("tries the fallback model once, only after the retry still answers 500 or 503, and records it", async () => {
    for (const status of ["500", "503"] as const) {
      const m = models({ cloud: fails(`fetch-error ${status} high demand`), fallback: ok("in_cloud") });
      expect(await readItem(m, img, "cloud_only", clock(0, 9)), status).toMatchObject({ source: "in_cloud", route: "cloud_only", fallbackAfter: status, read: validRead });
      expect(m.cloud.generate, status).toHaveBeenCalledTimes(2);
      expect(m.fallback.generate, status).toHaveBeenCalledTimes(1);
    }
    const hybrid = models({ hybrid: fails("QuotaExceededError"), cloud: fails("fetch-error 503"), fallback: ok("in_cloud") });
    expect(await readItem(hybrid, img, "hybrid", clock(0, 9))).toMatchObject({ route: "hybrid", recoveredFrom: "QuotaExceededError", fallbackAfter: "503" });
    expect(await readItem(models({ cloud: ok("in_cloud"), fallback: never() }), img, "cloud_only", clock(0, 9))).not.toHaveProperty("fallbackAfter");
  });

  it("never reaches the fallback on device_only or blocked, as when kill_cloud is on", async () => {
    const m = models({ device: fails("NotReadableError"), fallback: never() });
    await expect(readItem(m, img, "device_only", clock(0, 1))).rejects.toMatchObject({ kind: "device_failed" });
    await expect(readItem(m, img, "blocked", clock(0, 1))).rejects.toMatchObject({ kind: "blocked" });
    expect(m.fallback.generate).not.toHaveBeenCalled();
    expect(m.cloud.generate).not.toHaveBeenCalled();
  });

  it("checks that the cloud is still allowed before a retry, a fallback, and a hybrid recovery", async () => {
    // The switch goes off while the first cloud call is running: no retry follows.
    let allowed = true;
    const retry = models({ cloud: { generate: vi.fn(async () => { allowed = false; throw new Error("fetch-error 503"); }) }, fallback: ok("in_cloud") });
    await expect(readItem(retry, img, "cloud_only", clock(0, 1), () => allowed)).rejects.toMatchObject({ kind: "blocked" });
    expect(retry.cloud.generate).toHaveBeenCalledTimes(1);
    expect(retry.fallback.generate).not.toHaveBeenCalled();
    // The switch goes off during the retry: the fallback model is not tried.
    let calls = 0;
    const fallback = models({ cloud: { generate: vi.fn(async () => { if (++calls === 2) allowed = false; throw new Error("fetch-error 503"); }) }, fallback: ok("in_cloud") });
    allowed = true;
    await expect(readItem(fallback, img, "cloud_only", clock(0, 1), () => allowed)).rejects.toMatchObject({ kind: "blocked" });
    expect(fallback.cloud.generate).toHaveBeenCalledTimes(2);
    expect(fallback.fallback.generate).not.toHaveBeenCalled();
    // The switch goes off during a hybrid call that then fails: no cloud recovery follows.
    allowed = true;
    const hybrid = models({ hybrid: { generate: vi.fn(async () => { allowed = false; throw new Error("QuotaExceededError"); }) }, cloud: never() });
    await expect(readItem(hybrid, img, "hybrid", clock(0, 1), () => allowed)).rejects.toMatchObject({ kind: "blocked" });
    expect(hybrid.cloud.generate).not.toHaveBeenCalled();
  });

  it("tries the fallback once when the API says the model is gone, without retrying the gone model", async () => {
    for (const msg of [
      "[GoogleGenerativeAI Error]: fetch-error 404 Not Found: models/gemini-2.5-flash is no longer available to new users",
      "fetch-error 404 models/gemini-x is not found for API version v1beta, or is not supported for generateContent",
    ]) {
      const m = models({ cloud: fails(msg), fallback: ok("in_cloud") });
      expect(await readItem(m, img, "cloud_only", clock(0, 9)), msg).toMatchObject({ route: "cloud_only", fallbackAfter: "404", read: validRead });
      expect(m.cloud.generate, msg).toHaveBeenCalledTimes(1);
      expect(m.fallback.generate, msg).toHaveBeenCalledTimes(1);
    }
  });

  it("does not use the fallback for a 404 that does not say the model is gone", async () => {
    const m = models({ cloud: fails("fetch-error 404 Not Found"), fallback: never() });
    await expect(readItem(m, img, "cloud_only", clock(0, 1))).rejects.toMatchObject({ kind: "cloud_unreachable" });
    expect(m.fallback.generate).not.toHaveBeenCalled();
  });

  it("does not use the fallback for other failures, and does not retry the fallback", async () => {
    for (const msg of ["fetch-error 429 Too Many Requests", "Failed to fetch", "fetch-error 403", "fetch-error 502"]) {
      const m = models({ cloud: fails(msg), fallback: never() });
      await expect(readItem(m, img, "cloud_only", clock(0, 1)), msg).rejects.toBeInstanceOf(Error);
      expect(m.fallback.generate, msg).not.toHaveBeenCalled();
    }
    const both = models({ cloud: fails("fetch-error 503"), fallback: fails("fetch-error 503") });
    await expect(readItem(both, img, "cloud_only", clock(0, 1))).rejects.toMatchObject({ kind: "cloud_unreachable" });
    expect(both.fallback.generate).toHaveBeenCalledTimes(1);
    const none = models({ cloud: fails("fetch-error 503") });
    await expect(readItem(none, img, "cloud_only", clock(0, 1))).rejects.toMatchObject({ kind: "cloud_unreachable" });
  });

  it("calls invalid cloud output invalid_output", async () =>
    expect(readItem(models({ cloud: text("{\"itemName\":1}", "in_cloud") }), img, "cloud_only", clock(0, 1))).rejects.toMatchObject({ kind: "invalid_output" }));
});
