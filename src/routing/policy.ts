// Where a read may run (spec 5.3). One cloudAllowed check serves reads, second looks, descriptions and
// the live listing read.
import type { GateState, ImageHow, ReadRoute } from "../ai/port";
import type { SecondLookReason } from "../shared/secondLook";

export interface CloudInputs {
  cloudConsent: boolean | null;
  killCloud: boolean;
  online: boolean;
}

// Consent that was never answered counts as not given.
export function cloudAllowed(i: CloudInputs): boolean {
  return i.cloudConsent === true && !i.killCloud && i.online;
}

export function chooseReadRoute(i: CloudInputs & { gate: GateState }): ReadRoute {
  const cloud = cloudAllowed(i);
  if (i.gate === "available") return cloud ? "hybrid" : "device_only";
  return cloud ? "cloud_only" : "device_only";
}

// A frame the camera read by itself, because an item sat still, never leaves this device: it is read on
// the built-in model or not at all, even after the sender allowed cloud checks. Only a press (Check now,
// or an added photo) may use the cloud.
export function chooseImageRoute(how: ImageHow, i: CloudInputs & { gate: GateState }): ReadRoute | "skip" {
  if (how === "steady") return i.gate === "available" ? "device_only" : "skip";
  return chooseReadRoute(i);
}

// When an on-device read gets a cloud second look (spec 5.4): in src/shared, so the native engine bridge
// runs the same rule.
export { needsSecondLook, SECOND_LOOK_DEFAULT, type SecondLookPolicy, type SecondLookReason } from "../shared/secondLook";

export function shouldRunSecondLook(reason: SecondLookReason | null, c: CloudInputs): boolean {
  return reason !== null && cloudAllowed(c);
}
