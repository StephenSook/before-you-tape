// Test-only helpers shared by the engine tests.
import bundled from "../../rules/edition.json";
import { parseEdition } from "../../src/engine/edition";
import type { BatteryFacts, ItemFacts, RuleEdition } from "../../src/engine/types";

export const ed: RuleEdition = parseEdition(bundled);

export function withCustomsUnchecked(e: RuleEdition, code: string): RuleEdition {
  const copy = structuredClone(e);
  const dest = copy.destinations[code];
  if (!dest) throw new Error(`no edition for ${code}`);
  dest.customsChecked = false;
  return copy;
}

export function withSuspended(e: RuleEdition, codes: string[]): RuleEdition {
  const copy = structuredClone(e);
  copy.suspensions.codes = codes;
  return copy;
}

const noBattery: BatteryFacts = {
  presence: "none", chemistry: "unknown", volts: null, milliampHours: null, whPrinted: null, whComputed: null,
  whStatus: "none", wh: null, lithiumGrams: null, countAs: "unknown", units: 1,
};

export function factsOf(patch: Omit<Partial<ItemFacts>, "battery"> & { battery?: Partial<BatteryFacts> }): ItemFacts {
  return {
    category: "other", tags: [], evidence: "label_read", identity: "label", condition: "unknown", alcohol: "unknown",
    quantity: 1, ...patch, battery: { ...noBattery, ...patch.battery },
  };
}
