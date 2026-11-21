// Test-only helpers shared by the engine tests.
import bundled from "../../rules/edition.json";
import defaults from "../vectors/defaults.json";
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

// A suspension the post office has announced for a later date.
export function withUpcoming(e: RuleEdition, code: string, from: string): RuleEdition {
  const copy = structuredClone(e);
  copy.suspensions.codes = copy.suspensions.codes.filter((c) => c !== code);
  copy.suspensions.upcoming = [{ code, from }];
  return copy;
}

// The facts a test leaves out, shared with the native clients' vector runners.
const baseFacts = defaults.baseFacts as ItemFacts;

export function factsOf(patch: Omit<Partial<ItemFacts>, "battery"> & { battery?: Partial<BatteryFacts> }): ItemFacts {
  const base = structuredClone(baseFacts);
  return { ...base, ...patch, battery: { ...base.battery, ...patch.battery } };
}
