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

const printed = (n: number): number | null => (n > 0 ? n : null);
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

function presenceOf(read: ItemRead, answers: ItemAnswers, hasEvidence: boolean): BatteryFacts["presence"] {
  const answer = answers.battery_installed;
  if (answer === "installed" || answer === "loose" || answer === "packed_beside") return answer;
  if (LOOSE_CATEGORIES.has(read.category)) return "loose";
  if (BATTERY_DEVICES.has(read.category)) return "installed";
  if (MAYBE_BATTERY_DEVICES.has(read.category)) return hasEvidence ? "installed" : "unknown";
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
  const liMetal = tags.includes("li_metal");
  const anyNumber = volts !== null || milliampHours !== null || whPrinted !== null;
  const hasEvidence = read.batteryWords || anyNumber || liMetal;

  let whStatus: BatteryFacts["whStatus"];
  if (!inRange(volts, RANGE.volts) || !inRange(milliampHours, RANGE.milliampHours) || !inRange(whPrinted, RANGE.wattHours)) {
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

  const presence = presenceOf(read, answers, hasEvidence);
  let chemistry: BatteryFacts["chemistry"] = "unknown";
  if (liMetal) chemistry = "li_metal";
  else if (anyNumber || BATTERY_DEVICES.has(read.category) || LOOSE_CATEGORIES.has(read.category)) chemistry = "li_ion";

  return { presence, chemistry, volts, milliampHours, whPrinted, whComputed, whStatus, wh, countAs, units: quantity };
}
