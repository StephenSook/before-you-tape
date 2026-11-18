import { afterEach, describe, expect, it, vi } from "vitest";
import { CameraError, openCamera } from "./camera";

const stubMedia = (getUserMedia: () => Promise<MediaStream>) =>
  vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn(getUserMedia) } });

describe("openCamera", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("asks for the requested camera and stops every track", async () => {
    const stop = vi.fn();
    stubMedia(async () => ({ getTracks: () => [{ stop }, { stop }] }) as unknown as MediaStream);
    const cam = await openCamera("environment");
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    cam.stop();
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it("names why the camera did not open", async () => {
    for (const [name, kind] of [["NotAllowedError", "denied"], ["SecurityError", "denied"], ["NotFoundError", "none"], ["OverconstrainedError", "none"], ["NotReadableError", "busy"], ["AbortError", "busy"]] as const) {
      stubMedia(async () => { throw Object.assign(new Error(name), { name }); });
      await expect(openCamera("user"), name).rejects.toMatchObject({ kind });
    }
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: undefined });
    await expect(openCamera("user")).rejects.toBeInstanceOf(CameraError);
  });
});
