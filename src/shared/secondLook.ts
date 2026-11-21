// The cloud second look's pure parts (spec 5.4), shared by the web app and the native engine bridge:
// when an on-device read gets one, how the two reads merge, and which facts they dispute. No model call
// lives here; src/ai/secondLook.ts runs the cloud read.
import type { ItemFacts, ReadDisputes } from "../engine/types";
import type { ItemRead } from "./itemRead";

// When an on-device read gets a cloud second look (spec 5.4). Each reason can be turned off by policy.
export interface SecondLookPolicy { whMismatch: boolean; batteryNumbers: boolean; notSure: boolean; hazardNoLabel: boolean; identity: boolean }
export type SecondLookReason = "wh_mismatch" | "battery_numbers" | "not_sure" | "hazard_no_label" | "identity";

export const SECOND_LOOK_DEFAULT: SecondLookPolicy = { whMismatch: true, batteryNumbers: true, notSure: true, hazardNoLabel: true, identity: true };

// Tags that make an item a hazard; a hazard with no label read gets a second look.
const HAZARD_TAGS = ["flammable", "pressurized", "alcohol", "lighter", "vaping", "fragrance"];

// The first reason that applies, in this order, or null. Only reads that ran on the device qualify.
export function needsSecondLook(facts: ItemFacts, outcome: { source: string }, policy: SecondLookPolicy): SecondLookReason | null {
  if (outcome.source !== "on_device") return null;
  const b = facts.battery;
  if (policy.whMismatch && b.whStatus === "printed_mismatch") return "wh_mismatch";
  if (policy.batteryNumbers && b.presence !== "none") return "battery_numbers";
  if (policy.notSure && facts.evidence === "not_sure") return "not_sure";
  if (policy.hazardNoLabel && facts.identity !== "label" && facts.tags.some((t) => HAZARD_TAGS.includes(t))) return "hazard_no_label";
  if (policy.identity && facts.identity === "unconfirmed") return "identity";
  return null;
}

const HAZARD_FLAGS = ["batteryWords", "liquid", "pressurized", "alcoholOnLabel", "flammableOnLabel", "glassContainer", "powder"] as const;
const WH_FIELDS = ["volts", "milliampHours", "wattHours"] as const;

// Watt-hours as printed, or volts times capacity when none are printed.
const whOf = (r: ItemRead) => (r.wattHours > 0 ? r.wattHours : (r.volts * r.milliampHours) / 1000);
const batteryOf = (r: ItemRead) => ({ volts: r.volts, milliampHours: r.milliampHours, wattHours: r.wattHours });
// Evidence from weakest to strongest.
const EVIDENCE_RANK: Record<ItemRead["evidence"], number> = { not_sure: 0, item_seen: 1, label_read: 2 };

// Every disagreement is also a dispute (readDisputes) that holds the item at "Check this" until the sender
// confirms it. Meanwhile the merged value is the cautious one: the battery numbers of the read with more
// watt-hours, whole (a tie goes to the cloud), the larger lithium reading, any hazard flag either read saw,
// a box either read saw open, and the weaker of the two reads' evidence.
export function mergeReads(device: ItemRead, cloud: ItemRead): ItemRead {
  const merged: ItemRead = {
    ...cloud,
    // The longer label is the one shown; the store keeps both labels' tags, so a word only the shorter had
    // still counts.
    labelText: device.labelText.length > cloud.labelText.length ? device.labelText : cloud.labelText,
    ...batteryOf(whOf(device) > whOf(cloud) ? device : cloud),
    lithiumGrams: Math.max(device.lithiumGrams, cloud.lithiumGrams),
    retailBox: device.retailBox === cloud.retailBox ? cloud.retailBox
      : device.retailBox === "open_or_none" || cloud.retailBox === "open_or_none" ? "open_or_none" : "cannot_tell",
    evidence: EVIDENCE_RANK[device.evidence] < EVIDENCE_RANK[cloud.evidence] ? device.evidence : cloud.evidence,
  };
  for (const flag of HAZARD_FLAGS) merged[flag] = device[flag] || cloud[flag];
  return merged;
}

// The facts that can change a verdict on which the two reads disagree, each with both readings, for the
// sender to confirm. Label words need the edition's word list, so the store compares those.
export function readDisputes(device: ItemRead, cloud: ItemRead): ReadDisputes {
  const d: ReadDisputes = {};
  if (device.category !== cloud.category) d.category = { device: device.category, cloud: cloud.category, resolved: false };
  if (device.retailBox !== cloud.retailBox) d.retailBox = { device: device.retailBox, cloud: cloud.retailBox, resolved: false };
  if (WH_FIELDS.some((f) => device[f] !== cloud[f])) d.battery = { device: batteryOf(device), cloud: batteryOf(cloud), resolved: false };
  if (device.lithiumGrams !== cloud.lithiumGrams) d.lithiumGrams = { device: device.lithiumGrams, cloud: cloud.lithiumGrams, resolved: false };
  for (const flag of HAZARD_FLAGS) if (device[flag] !== cloud[flag]) d[flag] = { device: device[flag], cloud: cloud[flag], resolved: false };
  if (device.evidence !== cloud.evidence) d.evidence = { device: device.evidence, cloud: cloud.evidence, resolved: false };
  return d;
}
