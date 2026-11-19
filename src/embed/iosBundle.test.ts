// The iPhone runs the committed iOS bundle (ios/BYTCore/.../byt-engine.js) in JavaScriptCore. This
// runs that same file in a fresh V8 context with no Node globals, so a bundle that falls behind the
// engine or the shipped edition fails here, on any machine, before it reaches a phone.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
import box from "../../tests/vectors/box.json";
import defaults from "../../tests/vectors/defaults.json";

interface Bridge { setEdition(editionJson: string): string; evaluateBoxJson(inputJson: string): string }
type Reply = { ok: true; value: unknown } | { ok: false; error: { name: string; message: string } };

// Vitest runs from the repository root.
const bundle = readFileSync(join(process.cwd(), "ios/BYTCore/Sources/BYTCore/Resources/byt-engine.js"), "utf8");
const editionText = readFileSync(join(process.cwd(), "rules/edition.json"), "utf8");

function loadBundle(): Bridge {
  const context = createContext({});
  runInContext(bundle, context);
  return (context as { BYT: Bridge }).BYT;
}

interface VectorItem { itemId: string; read: Record<string, unknown>; [k: string]: unknown }
interface BoxVector { name: string; code: string; today: string; items: VectorItem[]; expect: Record<string, string>; expectRules?: Record<string, string[]> }
const item = (i: VectorItem) => ({ ...structuredClone(defaults.itemDefaults), ...i, read: { ...defaults.baseRead, ...i.read } });

describe("the committed iOS engine bundle", () => {
  it("loads the shipped rule edition", () => {
    const r = JSON.parse(loadBundle().setEdition(editionText)) as Reply;
    expect(r.ok ? "ok" : `${r.error.name}: ${r.error.message}`).toBe("ok");
  });

  it("gives every box vector its expected verdicts", () => {
    const BYT = loadBundle();
    expect((JSON.parse(BYT.setEdition(editionText)) as Reply).ok).toBe(true);
    for (const v of box as unknown as BoxVector[]) {
      const r = JSON.parse(BYT.evaluateBoxJson(JSON.stringify({ items: v.items.map(item), code: v.code, today: v.today }))) as Reply;
      expect(r.ok, v.name).toBe(true);
      if (!r.ok) continue;
      const items = (r.value as { items: Record<string, { level: string; hits: { ruleId: string }[] }> }).items;
      for (const [id, level] of Object.entries(v.expect)) expect(items[id]?.level, `${v.name} ${id}`).toBe(level);
      for (const [id, ids] of Object.entries(v.expectRules ?? {})) {
        expect(items[id]?.hits.map((h) => h.ruleId), `${v.name} ${id}`).toEqual(expect.arrayContaining(ids));
      }
    }
  });
});
