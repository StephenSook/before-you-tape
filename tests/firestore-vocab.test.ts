// The Firestore rules copy three fixed vocabularies; this keeps each copy equal to its source, so a new
// rule edition cannot make the rules refuse items the app saves.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import bundled from "../rules/edition.json";
import { ENGINE_TAGS } from "../src/engine/facts";
import { ITEM_CATEGORIES } from "../src/shared/itemRead";

const rules = readFileSync("firestore.rules", "utf8");
const after = (marker: string): string => {
  const at = rules.indexOf(`// vocab:${marker}`);
  if (at < 0) throw new Error(`firestore.rules has no "vocab:${marker}" marker`);
  return rules.slice(at, rules.indexOf("\n    }\n", at));
};
const quoted = (text: string) => [...text.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

describe("firestore.rules vocabularies", () => {
  it("lists exactly the item categories of the read contract", () =>
    expect(quoted(after("categories")).sort()).toEqual([...ITEM_CATEGORIES].sort()));

  it("lists exactly the tags the app can save: label words, category tags and engine tags", () => {
    const e = bundled as { labelWords: Array<{ tag?: string }>; categoryTags: Record<string, string[]> };
    const tags = new Set<string>([...ENGINE_TAGS, ...Object.values(e.categoryTags).flat()]);
    for (const w of e.labelWords) if (w.tag) tags.add(w.tag);
    expect(quoted(after("tags")).sort()).toEqual([...tags].sort());
  });

  it("lists exactly the edition's questions and each one's answers", () => {
    const qs = (bundled as { questions: Array<{ id: string; answers: Array<{ id: string } | string> }> }).questions;
    const block = after("answers");
    expect(quoted(/hasOnly\(\[([^\]]*)\]\)/.exec(block)?.[1] ?? "").sort()).toEqual(qs.map((q) => q.id).sort());
    for (const q of qs) {
      const line = new RegExp(`a\\.get\\('${q.id}', '[a-z_]+'\\) in \\[([^\\]]*)\\]`).exec(block)?.[1] ?? "";
      expect(quoted(line), q.id).toEqual(q.answers.map((a) => (typeof a === "string" ? a : a.id)));
    }
  });
});
