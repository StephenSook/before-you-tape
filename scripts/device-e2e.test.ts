import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { e2ePassed, evalPhotos, osName, profileLockState, requireEnv } from "./device-e2e";

describe("device-e2e helpers", () => {
  it("names a missing environment variable instead of skipping", () => {
    expect(() => requireEnv({}, "BYT_NANO_PROFILE")).toThrow(/BYT_NANO_PROFILE is not set/);
    expect(() => requireEnv({ BYT_NANO_PROFILE: "  " }, "BYT_NANO_PROFILE")).toThrow(/BYT_NANO_PROFILE is not set/);
    expect(requireEnv({ BYT_NANO_PROFILE: "/p" }, "BYT_NANO_PROFILE")).toBe("/p");
  });

  it("calls a profile in use only when its lock points at a live process on this machine", () => {
    const alive = (pid: number) => pid === 4242;
    expect(profileLockState(null, "mac.local", alive)).toBe("free");
    expect(profileLockState("mac.local-4242", "mac.local", alive)).toBe("in_use");
    expect(profileLockState("mac.local-62509", "mac.local", alive)).toBe("stale");
    // A lock from another machine cannot be checked from here, so it counts as in use.
    expect(profileLockState("other.local-4242", "mac.local", alive)).toBe("in_use");
    expect(profileLockState("garbage", "mac.local", alive)).toBe("in_use");
  });

  it("passes only when every read ran on the device and nothing went to the cloud model", () => {
    const read = (source: string) => ({ file: "a.jpg", source, ms: 1, recoveredFrom: null, error: null });
    expect(e2ePassed([read("on_device"), read("on_device")], 0)).toBe(true);
    expect(e2ePassed([read("on_device"), read("in_cloud")], 0)).toBe(false);
    expect(e2ePassed([read("on_device")], 1)).toBe(false);
    expect(e2ePassed([], 0)).toBe(false);
    expect(e2ePassed([{ ...read("on_device"), error: "device_failed" }], 0)).toBe(false);
  });

  it("reads named eval/set photos only when each file is the exact tracked photo", () => {
    const bytes = Buffer.from("a photo");
    const sha = createHash("sha256").update(bytes).digest("hex");
    const manifest = { items: [{ itemId: "own-18", photo: "/eval/items/own-18.jpg", photoSha256: sha }, { itemId: "own-01", photo: "/eval/items/own-01.jpg", photoSha256: "0".repeat(64) }] };
    const read = (path: string) => { if (!path.endsWith("own-18.jpg") && !path.endsWith("own-01.jpg")) throw new Error("no file"); return bytes; };
    expect(evalPhotos("own-18", manifest, read)).toEqual([{ file: "own-18.jpg", itemId: "own-18", base64: bytes.toString("base64") }]);
    expect(() => evalPhotos("own-01", manifest, read)).toThrow(/own-01: the file does not match its tracked SHA-256/);
    expect(() => evalPhotos("nope", manifest, read)).toThrow(/nope is not in eval\/set/);
    expect(() => evalPhotos("own-18,own-18,own-18,own-18", manifest, read)).toThrow(/at most 3/);
    expect(() => evalPhotos(" , ", manifest, read)).toThrow(/no eval\/set item/);
  });

  it("names the operating system with its product version", () => {
    expect(osName("darwin", "25.0.0", () => "27.0")).toBe("macOS 27.0");
    expect(osName("linux", "6.8.0", () => { throw new Error("no sw_vers"); })).toBe("Linux 6.8.0");
  });
});
