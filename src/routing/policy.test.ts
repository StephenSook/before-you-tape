import { describe, expect, it } from "vitest";
import { factsOf } from "../../tests/engine/helpers";
import { chooseImageRoute, chooseReadRoute, cloudAllowed, needsSecondLook, SECOND_LOOK_DEFAULT, shouldRunSecondLook, type SecondLookPolicy } from "./policy";

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

describe("second look policy", () => {
  const allOn: SecondLookPolicy = SECOND_LOOK_DEFAULT;
  const deviceOutcome = { source: "on_device" } as const;
  const cloudOutcome = { source: "in_cloud" } as const;
  const mismatchFacts = factsOf({ category: "phone", battery: { presence: "installed", volts: 3.7, milliampHours: 2500, whPrinted: 9.62, whStatus: "printed_mismatch" } });
  const batteryFacts = factsOf({ category: "power_bank", battery: { presence: "loose", volts: 3.7, milliampHours: 10000, whPrinted: 37, whStatus: "printed_matches", wh: 37 } });
  const unsureFacts = factsOf({ category: "other_electronics", evidence: "not_sure", identity: "unconfirmed" });
  // Tags as deriveFacts gives them: the tags of the category come with it.
  const sprayNoLabelFacts = factsOf({ category: "aerosol_spray", tags: ["pressurized"], evidence: "item_seen", identity: "unconfirmed" });
  const sprayLabelFacts = factsOf({ category: "aerosol_spray", tags: ["pressurized"], evidence: "label_read", identity: "label" });
  const shirtUnconfirmedFacts = factsOf({ category: "clothing", tags: ["clothing"], evidence: "item_seen", identity: "unconfirmed" });
  const labelledLotionFacts = factsOf({ category: "lotion_cream", evidence: "label_read", identity: "label" });

  it("turns every reason on by default", () =>
    expect(SECOND_LOOK_DEFAULT).toEqual({ whMismatch: true, batteryNumbers: true, notSure: true, hazardNoLabel: true, identity: true }));

  it("asks only for on-device reads and only by policy", () => {
    expect(needsSecondLook(mismatchFacts, deviceOutcome, allOn)).toBe("wh_mismatch");
    expect(needsSecondLook(batteryFacts, deviceOutcome, allOn)).toBe("battery_numbers");
    expect(needsSecondLook(unsureFacts, deviceOutcome, allOn)).toBe("not_sure");
    expect(needsSecondLook(sprayNoLabelFacts, deviceOutcome, allOn)).toBe("hazard_no_label");
    expect(needsSecondLook(shirtUnconfirmedFacts, deviceOutcome, allOn)).toBe("identity");
    expect(needsSecondLook(labelledLotionFacts, deviceOutcome, allOn)).toBeNull();
    expect(needsSecondLook(sprayLabelFacts, deviceOutcome, allOn)).toBeNull();
    expect(needsSecondLook(mismatchFacts, cloudOutcome, allOn)).toBeNull();
  });

  it("skips a reason the policy turns off and moves to the next one", () => {
    expect(needsSecondLook(mismatchFacts, deviceOutcome, { ...allOn, whMismatch: false })).toBe("battery_numbers");
    expect(needsSecondLook(mismatchFacts, deviceOutcome, { ...allOn, whMismatch: false, batteryNumbers: false })).toBeNull();
    expect(needsSecondLook(sprayNoLabelFacts, deviceOutcome, { ...allOn, hazardNoLabel: false })).toBe("identity");
  });

  it("runs no second look when the cloud is not allowed", () => {
    expect(shouldRunSecondLook("wh_mismatch", { cloudConsent: true, killCloud: false, online: true })).toBe(true);
    expect(shouldRunSecondLook(null, { cloudConsent: true, killCloud: false, online: true })).toBe(false);
    expect(shouldRunSecondLook("wh_mismatch", { cloudConsent: false, killCloud: false, online: true })).toBe(false);
    expect(shouldRunSecondLook("wh_mismatch", { cloudConsent: null, killCloud: false, online: true })).toBe(false);
    expect(shouldRunSecondLook("wh_mismatch", { cloudConsent: true, killCloud: true, online: true })).toBe(false);
    expect(shouldRunSecondLook("wh_mismatch", { cloudConsent: true, killCloud: false, online: false })).toBe(false);
  });
});

describe("chooseImageRoute", () => {
  const gates = ["available", "downloadable", "downloading", "unavailable", "no_api"] as const;
  const consents = [true, false, null] as const;

  it("reads a steady camera frame on this device only, or not at all, under every input", () => {
    for (const gate of gates) for (const cloudConsent of consents) for (const killCloud of [false, true]) for (const online of [true, false]) {
      const route = chooseImageRoute("steady", { gate, cloudConsent, killCloud, online });
      expect(route, `${gate} ${String(cloudConsent)} ${String(killCloud)} ${String(online)}`).toBe(gate === "available" ? "device_only" : "skip");
    }
  });

  it("uses the normal route for a press of Check now or an added photo", () => {
    const allowed = { cloudConsent: true, killCloud: false, online: true };
    expect(chooseImageRoute("check_now", { gate: "available", ...allowed })).toBe("hybrid");
    expect(chooseImageRoute("upload", { gate: "no_api", ...allowed })).toBe("cloud_only");
    expect(chooseImageRoute("check_now", { gate: "no_api", ...allowed, cloudConsent: null })).toBe("blocked");
  });
});
