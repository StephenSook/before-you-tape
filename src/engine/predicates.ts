// Evaluates a rule predicate against item facts. A missing or null fact never matches
// a positive test, so an unknown value can never satisfy a condition by accident.
import type { ItemFacts, Predicate } from "./types";

function factAt(facts: ItemFacts, path: string): unknown {
  let value: unknown = facts;
  for (const key of path.split(".")) {
    if (value === null || typeof value !== "object" || !(key in value)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

export function matches(pred: Predicate, facts: ItemFacts): boolean {
  if ("all" in pred) return pred.all.every((p) => matches(p, facts));
  if ("any" in pred) return pred.any.some((p) => matches(p, facts));
  if ("not" in pred) return !matches(pred.not, facts);
  const v = factAt(facts, pred.fact);
  if (v === undefined || v === null) return false;
  switch (pred.op) {
    case "eq":
      return v === pred.value;
    case "in":
      return Array.isArray(pred.value) && pred.value.includes(v);
    case "has":
      return Array.isArray(v) && v.includes(pred.value);
    case "gt":
      return typeof v === "number" && typeof pred.value === "number" && v > pred.value;
    case "lte":
      return typeof v === "number" && typeof pred.value === "number" && v <= pred.value;
  }
}
