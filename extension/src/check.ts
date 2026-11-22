import { resolveDestination } from "../../src/engine/edition";
import type { BoxItemInput, ItemAnswers, ItemRead, ItemVerdict, RuleEdition, VerdictLevel } from "../../src/engine/types";
import { evaluateBox } from "../../src/engine/verdict";

export type Route = "on_device" | "in_cloud" | "typed";
export type TypedDetails = Pick<ItemRead, "itemName" | "category" | "volts" | "milliampHours" | "wattHours" |
  "liquid" | "pressurized" | "alcoholOnLabel" | "batteryWords">;

export function typedRead(details: TypedDetails): ItemRead {
  return {
    ...details,
    labelText: "",
    lithiumGrams: 0,
    flammableOnLabel: false,
    glassContainer: false,
    powder: false,
    retailBox: "cannot_tell",
    evidence: "item_seen",
  };
}

const itemId = "product";

// typedByHand: the sender typed every detail, with no read to start from, so its battery numbers are theirs. A form
// filled in from a read is not: numbers left as the read gave them still need checking.
export function toBoxItem(read: ItemRead, options: { confirmed: boolean; answers: ItemAnswers; quantity: number; typedByHand?: boolean }): BoxItemInput {
  return {
    itemId, read, overrides: {}, answers: options.answers, quantity: options.quantity,
    labelTags: [], identityConfirmedBy: options.confirmed ? "sender" : null,
    ...(options.typedByHand ? { numbersFrom: "typed" as const } : {}),
  };
}

export function checkOne(item: BoxItemInput, edition: RuleEdition, destCode: string, today: string): ItemVerdict {
  const result = evaluateBox([item], edition, resolveDestination(edition, destCode, undefined, today), today).items[item.itemId];
  if (!result) throw new Error("The rules engine did not return an item verdict.");
  return result;
}

const buyLines: Record<VerdictLevel, string> = {
  ok: "Fine for this box, going by the shop page. Check the label when it arrives.",
  check: "Check this before you buy.",
  take_out: "Do not buy this for the box.",
};

export function buyLine(level: VerdictLevel): string {
  return buyLines[level];
}
