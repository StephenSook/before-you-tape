// Item rules: each rule whose condition holds for one item becomes a hit. Box rules
// (lithium count, marking, two boxes) and destination or layer rules are emitted elsewhere.
import { matches } from "./predicates";
import type { ItemFacts, Rule, RuleHit } from "./types";

export function evaluateItemRules(facts: ItemFacts, rules: Rule[]): RuleHit[] {
  const hits: RuleHit[] = [];
  for (const r of rules) {
    if (r.scope !== "item" || !matches(r.when, facts)) continue;
    const hit: RuleHit = { ruleId: r.id, layer: r.layer, level: r.outcome, text: r.ourWording, section: r.section, url: r.url };
    if (r.askId) hit.askId = r.askId;
    hits.push(hit);
  }
  return hits;
}
