import { describe, expect, it } from "vitest";
import { ed } from "../engine/helpers";
import type { Predicate } from "../../src/engine/types";

// Tags the engine code reads directly (src/engine/facts.ts and battery.ts), not through a rule.
const CODE_TAGS = new Set(["label_text", "alcohol", "alcohol_flag", "li_metal", "li_ion", "battery_label", "power_bank_label"]);
// Tags kept for country listings not built yet (Mexico's chocolate and powder lines, plan Task 27).
const RESERVED_FOR_LISTINGS = new Set(["chocolate", "powder"]);

function tagsIn(p: Predicate): string[] {
  if ("all" in p) return p.all.flatMap(tagsIn);
  if ("any" in p) return p.any.flatMap(tagsIn);
  if ("not" in p) return tagsIn(p.not);
  return p.fact === "tags" && p.op === "has" && typeof p.value === "string" ? [p.value] : [];
}

describe("label words", () => {
  it("never produce a tag that no rule, listing line or engine code reads", () => {
    const used = new Set<string>([...CODE_TAGS, ...RESERVED_FOR_LISTINGS]);
    for (const r of ed.rules) for (const t of tagsIn(r.when)) used.add(t);
    for (const d of Object.values(ed.destinations)) for (const l of d.lines) for (const m of l.matches) used.add(m.tag);
    const produced = new Set(ed.labelWords.map((w) => w.tag));
    expect([...produced].filter((t) => !used.has(t)).sort()).toEqual([]);
  });
});
