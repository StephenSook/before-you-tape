// The cloud second look (spec 5.4): the same crop and prompt read again in the cloud, then merged with the
// on-device read so that nothing the device saw is lost, and a fact the two reads dispute waits for the sender.
import type { ReadDisputes } from "../engine/types";
import type { SecondLookReason } from "../routing/policy";
import type { ItemRead } from "../shared/itemRead";
import { mergeReads, readDisputes } from "../shared/secondLook";
import { readItem, type StillAllowed } from "./itemRead";
import type { ImagePart, ModelPort } from "./port";

// The merge and the disputes are in src/shared, so the native engine bridge runs the same code.
export { mergeReads, readDisputes };

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
