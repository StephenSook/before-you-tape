import { describe, expect, it } from "vitest";
import { e2ePassed, profileLockState, requireEnv } from "./device-e2e";

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
});
