import { describe, expect, it, vi } from "vitest";
import { afterSignIn } from "./authGate";
import type { ImagePart, ItemModels, ModelPort } from "./port";

const img: ImagePart = { mimeType: "image/jpeg", base64: "AAAA" };
const port = (): ModelPort & { generate: ReturnType<typeof vi.fn> } => ({ generate: vi.fn(async () => ({ text: "{}", source: "in_cloud" as const })) });
const models = () => ({ device: port(), hybrid: port(), cloud: port(), fallback: port() }) satisfies ItemModels;

describe("afterSignIn", () => {
  it("starts no call that can reach the cloud until anonymous sign-in has finished", async () => {
    let signedIn!: (uid: string) => void;
    const m = models();
    const gated = afterSignIn(m, new Promise<string>((r) => { signedIn = r; }));
    const calls = [gated.hybrid.generate("p", img), gated.cloud.generate("p", img), gated.fallback!.generate("p", img)];
    await Promise.resolve();
    expect(m.hybrid.generate).not.toHaveBeenCalled();
    expect(m.cloud.generate).not.toHaveBeenCalled();
    expect(m.fallback.generate).not.toHaveBeenCalled();
    signedIn("anon-1");
    await Promise.all(calls);
    expect(m.cloud.generate).toHaveBeenCalledWith("p", img);
    expect(m.hybrid.generate).toHaveBeenCalledTimes(1);
    expect(m.fallback.generate).toHaveBeenCalledTimes(1);
  });

  it("asks again after sign-in, so a call whose cloud permission was withdrawn during the wait is never made", async () => {
    let signedIn!: (uid: string) => void;
    const m = models();
    const gated = afterSignIn(m, new Promise<string>((r) => { signedIn = r; }));
    let allowed = true;
    const withdrawn = gated.cloud.generate("p", img, { allowed: () => allowed });
    const ac = new AbortController();
    const aborted = gated.hybrid.generate("p", img, { allowed: () => true, signal: ac.signal });
    allowed = false;
    ac.abort();
    signedIn("anon-1");
    await expect(withdrawn).rejects.toMatchObject({ kind: "blocked" });
    await expect(aborted).rejects.toMatchObject({ kind: "blocked" });
    expect(m.cloud.generate).not.toHaveBeenCalled();
    expect(m.hybrid.generate).not.toHaveBeenCalled();
  });

  it("hands the permission check and the signal on to the call it lets through", async () => {
    const m = models();
    const opts = { allowed: () => true, signal: new AbortController().signal };
    await afterSignIn(m, Promise.resolve("u")).fallback!.generate("p", img, opts);
    expect(m.fallback.generate).toHaveBeenCalledWith("p", img, opts);
  });

  it("leaves the device-only port alone, so reads on the device work offline", async () => {
    const m = models();
    const gated = afterSignIn(m, new Promise<string>(() => {}));
    await gated.device.generate("p", img);
    expect(m.device.generate).toHaveBeenCalledTimes(1);
  });

  it("refuses a cloud call, without making it, when sign-in failed", async () => {
    const m = models();
    const gated = afterSignIn(m, Promise.reject(new Error("auth/network-request-failed")));
    await expect(gated.cloud.generate("p", img)).rejects.toMatchObject({ kind: "cloud_unreachable" });
    expect(m.cloud.generate).not.toHaveBeenCalled();
  });

  it("keeps a missing fallback missing", () => {
    const { fallback: _none, ...noFallback } = models();
    void _none;
    expect(afterSignIn(noFallback, Promise.resolve("u")).fallback).toBeUndefined();
  });
});
