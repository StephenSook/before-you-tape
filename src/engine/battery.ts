// Battery facts from the printed numbers. The model only copies numbers off the label;
// this code computes Wh = V x mAh / 1000 and checks it against the printed Wh.
import type { ItemCategory, ItemRead } from "../shared/itemRead";
import type { BatteryFacts, ItemAnswers, LithiumLimits } from "./types";

// Plausible label ranges (Spec 5.5). Outside them the read is treated as a misread.
const RANGE = { volts: [1, 60], milliampHours: [10, 100_000], wattHours: [0.05, 400] } as const;

// Devices that always hold a lithium battery.
const BATTERY_DEVICES: ReadonlySet<ItemCategory> = new Set(["phone", "tablet", "laptop", "smartwatch", "earbuds"]);
// Devices that may or may not hold one; installed only with battery evidence, else unknown.
const MAYBE_BATTERY_DEVICES: ReadonlySet<ItemCategory> = new Set([
  "battery_toy", "musical_card", "other_electronics", "e_cigarette",
]);
const LOOSE_CATEGORIES: ReadonlySet<ItemCategory> = new Set(["power_bank", "loose_battery"]);

// Typed fixes reach the engine unparsed, so a value may arrive as text. Only a real number counts.
const isNumber = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
const printed = (n: unknown): number | null => (isNumber(n) && n > 0 ? n : null);
const inRange = (n: number | null, [lo, hi]: readonly [number, number]) => n === null || (n >= lo && n <= hi);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function crossCheckWh(
  volts: number,
  milliampHours: number,
  whPrinted: number,
  tolerancePct: number,
): "printed_matches" | "printed_mismatch" {
  const computed = (volts * milliampHours) / 1000;
  const diffPct = (Math.abs(computed - whPrinted) / whPrinted) * 100;
  return diffPct > tolerancePct ? "printed_mismatch" : "printed_matches";
}

function presenceOf(
  read: ItemRead, answers: ItemAnswers, hasEvidence: boolean, lithiumEvidence: boolean, tags: string[],
): BatteryFacts["presence"] {
  // A power bank or a loose battery is never installed in a device, whatever an answer saved
  // under an earlier reading says, so the category comes first. A label that says power bank or
  // battery pack also means loose, except on a device that holds its own pack (a laptop sticker).
  if (LOOSE_CATEGORIES.has(read.category)) return "loose";
  if (tags.includes("power_bank_label") && !BATTERY_DEVICES.has(read.category)) return "loose";
  const answer = answers.battery_installed;
  if (answer === "loose" || answer === "packed_beside") return answer;
  // A phone, tablet, laptop, smartwatch or earbuds always hold a lithium battery: a saved
  // "no battery" or "not lithium" answer from an earlier reading cannot clear one.
  if (BATTERY_DEVICES.has(read.category)) return "installed";
  if (answer === "installed") return "installed";
  // "No battery" and "not lithium" count only when nothing printed says lithium; a label that
  // says LI-ION or prints mAh, Wh or grams keeps the battery in the lithium checks.
  if ((answer === "none" || answer === "not_lithium") && !lithiumEvidence) return "none";
  // Volts alone (a mains appliance) or the word battery alone (AA, AAA) is not lithium evidence: ask.
  if (MAYBE_BATTERY_DEVICES.has(read.category)) return lithiumEvidence ? "installed" : "unknown";
  return hasEvidence ? "unknown" : "none";
}

export function deriveBattery(
  read: ItemRead,
  answers: ItemAnswers,
  quantity: number,
  limits: LithiumLimits,
  tags: string[],
): BatteryFacts {
  const volts = printed(read.volts);
  const milliampHours = printed(read.milliampHours);
  const whPrinted = printed(read.wattHours);
  const whComputed = volts !== null && milliampHours !== null ? round2((volts * milliampHours) / 1000) : null;
  // Printed lithium grams are a lithium metal rating, checked against the per-cell and per-battery limits.
  const lithiumGrams = printed(read.lithiumGrams);
  const liMetal = tags.includes("li_metal") || lithiumGrams !== null;
  const liIon = tags.includes("li_ion");
  const anyNumber = volts !== null || milliampHours !== null || whPrinted !== null || lithiumGrams !== null;
  // Label words count as battery evidence even when the model's batteryWords flag is false.
  const labelEvidence = liMetal || liIon || tags.includes("battery_label") || tags.includes("power_bank_label");
  // A battery number that is not a real number (text, NaN, negative) is a misread, never a pass.
  const badNumber = [read.volts, read.milliampHours, read.wattHours, read.lithiumGrams].some((n) => !isNumber(n));
  const hasEvidence = read.batteryWords || anyNumber || labelEvidence || badNumber;
  const lithiumEvidence = milliampHours !== null || whPrinted !== null || liMetal || liIon || tags.includes("power_bank_label");

  let whStatus: BatteryFacts["whStatus"];
  if (badNumber || !inRange(volts, RANGE.volts) || !inRange(milliampHours, RANGE.milliampHours) || !inRange(whPrinted, RANGE.wattHours)) {
    whStatus = "implausible";
  } else if (whPrinted !== null && volts !== null && milliampHours !== null) {
    whStatus = crossCheckWh(volts, milliampHours, whPrinted, limits.whTolerancePct);
  } else if (whPrinted !== null) {
    whStatus = "printed_only";
  } else if (whComputed !== null) {
    whStatus = "computed_only";
  } else {
    whStatus = "none";
  }
  const wh = whStatus === "printed_matches" || whStatus === "printed_only" ? whPrinted : null;

  let countAs: BatteryFacts["countAs"] = "unknown";
  const cellAnswer = answers.cell_count;
  if (cellAnswer === "one") countAs = "cell";
  else if (cellAnswer === "more_than_one") countAs = "battery";
  else if (whStatus !== "implausible") {
    const bestWh = wh ?? whPrinted ?? whComputed;
    if ((volts !== null && volts > limits.seriesVoltsThreshold) || (bestWh !== null && bestWh > limits.cellMaxWh)) {
      countAs = "battery";
    }
  }

  const presence = presenceOf(read, answers, hasEvidence, lithiumEvidence, tags);
  let chemistry: BatteryFacts["chemistry"] = "unknown";
  if (liMetal) chemistry = "li_metal";
  else if (liIon) chemistry = "li_ion";
  // The sender's "not lithium" answer counts only when no lithium evidence says otherwise, and never for
  // a device that always holds a lithium battery.
  else if (answers.battery_installed === "not_lithium" && !BATTERY_DEVICES.has(read.category)) chemistry = "not_lithium";
  else if (anyNumber || BATTERY_DEVICES.has(read.category) || LOOSE_CATEGORIES.has(read.category)) chemistry = "li_ion";

  return { presence, chemistry, volts, milliampHours, whPrinted, whComputed, whStatus, wh, lithiumGrams, countAs, units: quantity };
}
