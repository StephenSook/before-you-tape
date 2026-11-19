// The cloud second look (spec 5.4): the same crop and prompt read again in the cloud, then merged with the
// on-device read so that nothing the device saw is lost, and a fact the two reads dispute waits for the sender.
import type { ReadDisputes } from "../engine/types";
import type { SecondLookReason } from "../routing/policy";
import type { ItemRead } from "../shared/itemRead";
import { readItem, type StillAllowed } from "./itemRead";
import type { ImagePart, ModelPort } from "./port";

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

const NOT_USED: ModelPort = {
  async generate() {
    throw new Error("a second look reads only in the cloud");
  },
};

export async function runSecondLook(
  cloud: ModelPort, image: ImagePart, device: ItemRead, now: () => number, fallback?: ModelPort,
  stillAllowed: StillAllowed = () => true, signal?: AbortSignal,
): Promise<{ merged: ItemRead; ms: number; sameCategory: boolean; cloudLabel: string; disputes: ReadDisputes }> {
  // The cloud-only route brings the same retry, refusal handling and fallback as a first read.
  const models = fallback ? { device: NOT_USED, hybrid: NOT_USED, cloud, fallback } : { device: NOT_USED, hybrid: NOT_USED, cloud };
  const out = await readItem(models, image, "cloud_only", now, stillAllowed, signal);
  return { merged: mergeReads(device, out.read), disputes: readDisputes(device, out.read), ms: out.ms, sameCategory: out.read.category === device.category, cloudLabel: out.fullLabelText ?? out.read.labelText };
}

export const SECOND_LOOK_TEXT: Record<SecondLookReason, string> = {
  wh_mismatch: "The watt-hours on the label did not match the volts and capacity, so the cloud read it again.",
  battery_numbers: "Battery numbers decide what may be mailed, so the cloud read them again.",
  not_sure: "The first read was not sure what this is, so the cloud looked again.",
  hazard_no_label: "Items like this need their label read, so the cloud looked again.",
  identity: "The first read could not confirm what this is, so the cloud looked again.",
};
