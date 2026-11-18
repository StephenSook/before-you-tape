// The per-box lithium rule (Pub 52 622.5): at most 4 cells or 2 batteries, not both.
// A device whose battery could be a cell or a battery is tried both ways.
import type { BatteryFacts, LithiumLimits } from "./types";

export const TWO_BOX_NOTE = "No more than 2 boxes with lithium batteries can go to one address in one mailing.";

export interface LithiumEntry {
  itemId: string;
  battery: BatteryFacts;
}

export interface LithiumBoxResult {
  status: "none" | "ok" | "over" | "mixed" | "depends";
  cells: { min: number; max: number };
  batteries: { min: number; max: number };
  itemIds: string[];
  unknownItemIds: string[];
  text: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function evaluateLithiumBox(entries: LithiumEntry[], limits: LithiumLimits): LithiumBoxResult {
  // Only batteries installed in their device count here. Loose or packed-beside batteries
  // are taken out by the item rules, and an unknown presence is already "Check this".
  const counted = entries.filter((e) => e.battery.presence === "installed");
  const sortedIds = (list: LithiumEntry[]) => [...new Set(list.map((e) => e.itemId))].sort();
  if (counted.length === 0) {
    return { status: "none", cells: { min: 0, max: 0 }, batteries: { min: 0, max: 0 }, itemIds: [], unknownItemIds: [], text: "" };
  }

  const assumeCell = limits.unknownCountPolicy === "assume_cell";
  let knownCells = 0;
  let knownBatteries = 0;
  const unknown: LithiumEntry[] = [];
  for (const e of counted) {
    const kind = e.battery.countAs === "unknown" && assumeCell ? "cell" : e.battery.countAs;
    if (kind === "cell") knownCells += e.battery.units;
    else if (kind === "battery") knownBatteries += e.battery.units;
    else unknown.push(e);
  }

  const unknownUnits = unknown.reduce((n, e) => n + e.battery.units, 0);
  // When the total is above both limits added together, every split is over a limit, so the two
  // extreme splits give the whole range and nothing needs enumerating (a huge box cannot blow up).
  const total = knownCells + knownBatteries + unknownUnits;
  let sums = new Set<number>([0, unknownUnits]);
  if (total <= limits.maxCells + limits.maxBatteries) {
    // Every reachable number of unknown units read as cells; the rest read as batteries.
    sums = new Set<number>([0]);
    for (const e of unknown) sums = new Set([...sums].flatMap((s) => [s, s + e.battery.units]));
  }

  const outcomes = [...sums].map((s) => {
    const cells = knownCells + s;
    const batteries = knownBatteries + unknownUnits - s;
    const ok = (batteries === 0 && cells <= limits.maxCells) || (cells === 0 && batteries <= limits.maxBatteries);
    // Over a count limit is over under any reading of "not both", so it wins over mixed.
    const over = cells > limits.maxCells || batteries > limits.maxBatteries;
    const kind: "ok" | "mixed" | "over" = ok ? "ok" : over ? "over" : "mixed";
    return { cells, batteries, kind };
  });

  const okCount = outcomes.filter((o) => o.kind === "ok").length;
  const status: LithiumBoxResult["status"] =
    okCount === outcomes.length ? "ok"
      : okCount > 0 ? "depends"
        : outcomes.every((o) => o.kind === "over") ? "over"
          : "mixed";

  const cellCounts = outcomes.map((o) => o.cells);
  const batteryCounts = outcomes.map((o) => o.batteries);
  const cells = { min: Math.min(...cellCounts), max: Math.max(...cellCounts) };
  const batteries = { min: Math.min(...batteryCounts), max: Math.max(...batteryCounts) };
  const rule = `${limits.maxCells} cells or ${limits.maxBatteries} batteries, not both`;

  let text: string;
  if (status === "ok") {
    text = `Lithium batteries in this box are within the limit: ${rule}.`;
  } else if (status === "over") {
    if (batteries.max === 0) text = `${plural(cells.max, "cell", "cells")} in this box. The limit is ${limits.maxCells}. ${TWO_BOX_NOTE}`;
    else if (cells.max === 0) {
      text = `${plural(batteries.max, "battery", "batteries")} in this box. The limit is ${limits.maxBatteries}. ${TWO_BOX_NOTE}`;
    } else if (unknownUnits === 0) {
      text = `${plural(batteries.max, "battery", "batteries")} and ${plural(cells.max, "cell", "cells")} in this box. The limit is ${rule}. ${TWO_BOX_NOTE}`;
    } else text = `Too many lithium batteries in this box. The limit is ${rule}. ${TWO_BOX_NOTE}`;
  } else if (status === "mixed") {
    text = `This box has both a battery and a cell. A box can hold ${rule}. ${TWO_BOX_NOTE}`;
  } else {
    text = `The answer depends on how many cells each battery has. A box can hold ${rule}. ${TWO_BOX_NOTE}`;
  }

  return { status, cells, batteries, itemIds: sortedIds(counted), unknownItemIds: sortedIds(unknown), text };
}
