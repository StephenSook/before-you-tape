import { afterEach, describe, expect, it, vi } from "vitest";
import { appCheckVerdict, APP_CHECK_WAIT_MS } from "./appCheckVerdict";

const sdkError = (code: string) => Object.assign(new Error(`AppCheck: ${code}`), { code: `appCheck/${code}` });

describe("appCheckVerdict", () => {
  afterEach(() => vi.useRealTimers());

  it("passes once App Check gives this browser a token", async () => {
    await expect(appCheckVerdict(async () => ({ token: "t" }), () => true)).resolves.toBe(true);
  });

  it("fails when the exchange is refused, throttled after a refusal, or reCAPTCHA fails", async () => {
    for (const code of ["fetch-status-error", "throttled", "initial-throttle", "recaptcha-error"]) {
      await expect(appCheckVerdict(async () => { throw sdkError(code); }, () => true), code).resolves.toBe(false);
    }
  });

  it("does not fail a browser for having no connection", async () => {
    await expect(appCheckVerdict(async () => { throw sdkError("fetch-network-error"); }, () => true)).resolves.toBe(true);
  });

  // With reCAPTCHA blocked, the SDK waits for it forever and getToken never settles.
  it("fails a browser that is online but gets no answer within the wait, and not one that is offline", async () => {
    vi.useFakeTimers();
    const never = () => new Promise<never>(() => {});
    const online = appCheckVerdict(never, () => true);
    const offline = appCheckVerdict(never, () => false);
    await vi.advanceTimersByTimeAsync(APP_CHECK_WAIT_MS - 1);
    let settled = false;
    void online.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(online).resolves.toBe(false);
    await expect(offline).resolves.toBe(true);
  });
});
