import { describe, expect, it } from "vitest";
import { chooseReadRoute, cloudAllowed } from "./policy";

describe("routing policy", () => {
  it("treats unanswered consent as not allowed", () => {
    expect(cloudAllowed({ cloudConsent: null, killCloud: false, online: true })).toBe(false);
    expect(cloudAllowed({ cloudConsent: true, killCloud: false, online: true })).toBe(true);
  });

  it("refuses the cloud when offline or switched off", () => {
    expect(cloudAllowed({ cloudConsent: true, killCloud: false, online: false })).toBe(false);
    expect(cloudAllowed({ cloudConsent: true, killCloud: true, online: true })).toBe(false);
    expect(cloudAllowed({ cloudConsent: false, killCloud: false, online: true })).toBe(false);
  });

  it("chooses the route for every gate and every reason the cloud is not allowed", () => {
    const c = (o = {}) => chooseReadRoute({ gate: "available", cloudConsent: true, killCloud: false, online: true, ...o });
    expect(c()).toBe("hybrid");
    for (const off of [{ cloudConsent: false }, { online: false }, { killCloud: true }]) {
      expect(c(off)).toBe("device_only");
      for (const gate of ["downloadable", "downloading", "unavailable", "no_api"] as const) expect(c({ gate, ...off })).toBe("blocked");
    }
    for (const gate of ["downloadable", "downloading", "unavailable", "no_api"] as const) expect(c({ gate })).toBe("cloud_only");
  });
});
