// Where a read may run (spec 5.3). One cloudAllowed check serves reads, second looks, descriptions and
// the live listing read.
import type { ReadOutcome } from "../ai/itemRead";
import type { GateState, ReadRoute } from "../ai/port";
import type { ItemFacts } from "../engine/types";

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

// When an on-device read gets a cloud second look (spec 5.4). Each reason can be turned off by policy.
export interface SecondLookPolicy { whMismatch: boolean; batteryNumbers: boolean; notSure: boolean; hazardNoLabel: boolean; identity: boolean }
export type SecondLookReason = "wh_mismatch" | "battery_numbers" | "not_sure" | "hazard_no_label" | "identity";

export const SECOND_LOOK_DEFAULT: SecondLookPolicy = { whMismatch: true, batteryNumbers: true, notSure: true, hazardNoLabel: true, identity: true };

// Tags that make an item a hazard; a hazard with no label read gets a second look.
const HAZARD_TAGS = ["flammable", "pressurized", "alcohol", "lighter", "vaping", "fragrance"];

// The first reason that applies, in this order, or null. Only reads that ran on the device qualify.
export function needsSecondLook(facts: ItemFacts, outcome: Pick<ReadOutcome, "source">, policy: SecondLookPolicy): SecondLookReason | null {
  if (outcome.source !== "on_device") return null;
  const b = facts.battery;
  if (policy.whMismatch && b.whStatus === "printed_mismatch") return "wh_mismatch";
  if (policy.batteryNumbers && b.presence !== "none") return "battery_numbers";
  if (policy.notSure && facts.evidence === "not_sure") return "not_sure";
  if (policy.hazardNoLabel && facts.identity !== "label" && facts.tags.some((t) => HAZARD_TAGS.includes(t))) return "hazard_no_label";
  if (policy.identity && facts.identity === "unconfirmed") return "identity";
  return null;
}

export function shouldRunSecondLook(reason: SecondLookReason | null, c: CloudInputs): boolean {
  return reason !== null && cloudAllowed(c);
}
