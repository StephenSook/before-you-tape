import { describe, expect, it, vi } from "vitest";
import type { ImagePart } from "../ai/port";
import { CONFIG_DEFAULTS } from "../config/defaults";
import type { AppConfig } from "../config/remoteConfig";
import { SampleMismatch } from "./LiveReadPanel";
import { pausedAfterSettings, sampleReader } from "./liveReadDeps";

const bytes = new TextEncoder().encode("the sample photo").buffer as ArrayBuffer;
const sha = async (b: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", b)), (x) => x.toString(16).padStart(2, "0")).join("");
const part: ImagePart = { mimeType: "image/jpeg", base64: "/9j/AAAA" };

describe("sampleReader", () => {
  it("crops the whole sample photo when its bytes match the record", async () => {
    const close = vi.fn();
    const decode = vi.fn(async () => ({ width: 10, height: 10, close }) as unknown as ImageBitmap);
    const crop = vi.fn(async () => part);
    const read = sampleReader({ url: "/s.jpg", sha256: await sha(bytes) }, async () => bytes, decode, crop);
    expect(await read()).toBe(part);
    expect(crop).toHaveBeenCalledWith(expect.anything(), { x: 0, y: 0, w: 1, h: 1 });
    expect(close).toHaveBeenCalled();
  });

  it("never decodes or crops a sample whose bytes do not match the record", async () => {
    const decode = vi.fn();
    const crop = vi.fn();
    const read = sampleReader({ url: "/s.jpg", sha256: "0".repeat(64) }, async () => bytes, decode, crop);
    await expect(read()).rejects.toBeInstanceOf(SampleMismatch);
    expect(decode).not.toHaveBeenCalled();
    expect(crop).not.toHaveBeenCalled();
  });
});

describe("pausedAfterSettings", () => {
  const source = (c: { killCloud: boolean; pauseUnknown?: true }, ready: Promise<void>) => ({ get: (): AppConfig => ({ ...CONFIG_DEFAULTS, ...c }), subscribe: () => () => {}, ready });

  it("waits for the settings, then says whether cloud checks are paused", async () => {
    expect(await pausedAfterSettings(source({ killCloud: false }, Promise.resolve()), 1000)).toBe(false);
    expect(await pausedAfterSettings(source({ killCloud: true }, Promise.resolve()), 1000)).toBe(true);
  });

  it("counts settings that never arrive as paused", async () => {
    expect(await pausedAfterSettings(source({ killCloud: true, pauseUnknown: true }, new Promise(() => {})), 20)).toBe(true);
  });
});
