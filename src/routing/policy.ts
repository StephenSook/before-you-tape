// Where a read may run (spec 5.3). One cloudAllowed check serves reads, second looks, descriptions and
// the live listing read.
import type { GateState, ReadRoute } from "../ai/port";

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
  return cloud ? "cloud_only" : "blocked";
}
