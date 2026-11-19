// The cloud second look (spec 5.4): the same crop and prompt read again in the cloud, then merged with the
// on-device read so that nothing the device saw is lost and no number stands that the two reads dispute.
import { crossCheckWh } from "../engine/battery";
import type { SecondLookReason } from "../routing/policy";
import type { ItemRead } from "../shared/itemRead";
import { readItem, type StillAllowed } from "./itemRead";
import type { ImagePart, ModelPort } from "./port";

// The bundled edition's Wh tolerance; the page passes the edition in use, and a test pins the two together.
export const MERGE_WH_TOLERANCE_PCT = 3;

const HAZARD_FLAGS = ["batteryWords", "liquid", "pressurized", "alcoholOnLabel", "flammableOnLabel", "glassContainer", "powder"] as const;
const WH_FIELDS = ["volts", "milliampHours", "wattHours"] as const;

// Differing battery numbers keep the value that makes volts times capacity agree with the printed Wh;
// a number nothing confirms becomes 0, which leaves the item at "Check this".
function mergeBatteryNumbers(device: ItemRead, cloud: ItemRead, tolerancePct: number): Pick<ItemRead, (typeof WH_FIELDS)[number]> {
  const options = WH_FIELDS.map((f) => [...new Set([device[f], cloud[f]])]);
  const consistent: number[][] = [];
  for (const v of options[0]!) for (const mah of options[1]!) for (const wh of options[2]!) {
    if (v > 0 && mah > 0 && wh > 0 && crossCheckWh(v, mah, wh, tolerancePct) === "printed_matches") consistent.push([v, mah, wh]);
  }
  const pick = (i: number): number => {
    if (options[i]!.length === 1) return options[i]![0]!;
    const agreed = new Set(consistent.map((c) => c[i]!));
    return agreed.size === 1 ? [...agreed][0]! : 0;
  };
  return { volts: pick(0), milliampHours: pick(1), wattHours: pick(2) };
}

export function mergeReads(device: ItemRead, cloud: ItemRead, tolerancePct = MERGE_WH_TOLERANCE_PCT): ItemRead {
  const merged: ItemRead = {
    ...cloud,
    // The longer label is the one shown; the store keeps both labels' tags, so a word only the shorter had
    // still counts.
    labelText: device.labelText.length > cloud.labelText.length ? device.labelText : cloud.labelText,
    ...mergeBatteryNumbers(device, cloud, tolerancePct),
    lithiumGrams: device.lithiumGrams === cloud.lithiumGrams ? cloud.lithiumGrams : 0,
    retailBox: device.retailBox === cloud.retailBox ? cloud.retailBox : "cannot_tell",
  };
  for (const flag of HAZARD_FLAGS) merged[flag] = device[flag] || cloud[flag];
  return merged;
}

const NOT_USED: ModelPort = {
  async generate() {
    throw new Error("a second look reads only in the cloud");
  },
};

export async function runSecondLook(
  cloud: ModelPort, image: ImagePart, device: ItemRead, now: () => number, fallback?: ModelPort, tolerancePct = MERGE_WH_TOLERANCE_PCT,
  stillAllowed: StillAllowed = () => true, signal?: AbortSignal,
): Promise<{ merged: ItemRead; ms: number; sameCategory: boolean; cloudLabel: string }> {
  // The cloud-only route brings the same retry, refusal handling and fallback as a first read.
  const models = fallback ? { device: NOT_USED, hybrid: NOT_USED, cloud, fallback } : { device: NOT_USED, hybrid: NOT_USED, cloud };
  const out = await readItem(models, image, "cloud_only", now, stillAllowed, signal);
  return { merged: mergeReads(device, out.read, tolerancePct), ms: out.ms, sameCategory: out.read.category === device.category, cloudLabel: out.read.labelText };
}

export const SECOND_LOOK_TEXT: Record<SecondLookReason, string> = {
  wh_mismatch: "The watt-hours on the label did not match the volts and capacity, so the cloud read it again.",
  battery_numbers: "Battery numbers decide what may be mailed, so the cloud read them again.",
  not_sure: "The first read was not sure what this is, so the cloud looked again.",
  hazard_no_label: "Items like this need their label read, so the cloud looked again.",
  identity: "The first read could not confirm what this is, so the cloud looked again.",
};
