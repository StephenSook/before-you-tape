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
