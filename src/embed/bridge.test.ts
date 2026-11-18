import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import edition from "../../rules/edition.json";
import box from "../../tests/vectors/box.json";
import guards from "../../tests/vectors/box-guards.json";
import defaults from "../../tests/vectors/defaults.json";
import destinations from "../../tests/vectors/destinations.json";
import { canonicalJson, parseEdition } from "../engine/edition";
import { labelTagsOf } from "../engine/facts";
import type { RuleHit } from "../engine/types";
import type { BoxResult } from "../engine/verdict";
import { ITEM_READ_FIELDS, LABEL_TEXT_MAX } from "../shared/itemRead";
import * as BYT from "./bridge";

type Reply<T> = { ok: true; value: T } | { ok: false; error: { name: string; message: string } };
const reply = <T>(text: string): Reply<T> => JSON.parse(text) as Reply<T>;
const value = <T>(text: string): T => {
  const r = reply<T>(text);
  if (!r.ok) throw new Error(`${r.error.name}: ${r.error.message}`);
  return r.value;
};

interface VectorItem { itemId: string; read: Record<string, unknown>; [k: string]: unknown }
interface BoxVector {
  name: string; code: string; today: string; items: VectorItem[]; expect: Record<string, string>;
  expectRules?: Record<string, string[]>; notRules?: Record<string, string[]>; expectLithium?: string;
  expectQuestion?: Record<string, string>;
}
const item = (i: VectorItem) => ({ ...structuredClone(defaults.itemDefaults), ...i, read: { ...defaults.baseRead, ...i.read } });

function checkBox(v: BoxVector) {
  const r = value<BoxResult>(BYT.evaluateBoxJson(JSON.stringify({ items: v.items.map(item), code: v.code, today: v.today })));
  for (const [id, level] of Object.entries(v.expect)) expect(r.items[id]?.level, `${v.name} ${id}`).toBe(level);
  for (const [id, ids] of Object.entries(v.expectRules ?? {})) {
    expect(r.items[id]?.hits.map((h) => h.ruleId), `${v.name} ${id}`).toEqual(expect.arrayContaining(ids));
  }
  for (const [id, ids] of Object.entries(v.notRules ?? {})) {
    for (const ruleId of ids) expect(r.items[id]?.hits.map((h) => h.ruleId), `${v.name} ${id}`).not.toContain(ruleId);
  }
  if (v.expectLithium) expect(r.lithium.status, v.name).toBe(v.expectLithium);
  for (const [id, q] of Object.entries(v.expectQuestion ?? {})) expect(r.items[id]?.question?.id, `${v.name} ${id}`).toBe(q);
}

const original = globalThis.structuredClone;
afterEach(() => {
  globalThis.structuredClone = original;
});

describe("the JSON bridge for native clients", () => {
  it("runs every shared vector through the JSON bridge", () => {
    value(BYT.setEdition(JSON.stringify(edition)));
    const boxes = box as unknown as BoxVector[];
    const guardList = guards as unknown as BoxVector[];
    expect(boxes.length).toBeGreaterThanOrEqual(20);
    expect(guardList.length).toBeGreaterThanOrEqual(64);
    expect(destinations.length).toBeGreaterThanOrEqual(21);
    for (const v of boxes) checkBox(v);
    for (const g of guardList) {
      expect(Object.keys(g.expect).sort(), `${g.name} must pin a verdict for each item`).toEqual(g.items.map((i) => i.itemId).sort());
      checkBox(g);
    }
    for (const v of destinations) {
      const facts = { ...structuredClone(defaults.baseFacts), tags: v.tags };
      const hits = value<RuleHit[]>(BYT.destinationHitsJson(JSON.stringify({ facts, answers: {}, code: v.code })));
      expect(hits.map((h) => ({ ruleId: h.ruleId, level: h.level })), v.name).toEqual(v.expect);
    }
  });

  it("returns an error reply instead of throwing", async () => {
    vi.resetModules();
    const fresh = await import("./bridge");
    const before = reply(fresh.evaluateBoxJson("{}"));
    expect(before.ok).toBe(false);
    if (!before.ok) expect(before.error.name).toBe("NoEditionError");
    const bad = reply(fresh.parseItemReadJson("not json"));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.name).toBe("InvalidReadError");
    expect(reply(fresh.setEdition("not json")).ok).toBe(false);
    value(fresh.setEdition(JSON.stringify(edition)));
    const shapeless = reply(fresh.evaluateBoxJson("{}"));
    expect(shapeless.ok).toBe(false);
    if (!shapeless.ok) expect(shapeless.error.name).toBe("BadInputError");
  });

  it("works where structuredClone is missing", async () => {
    const native = canonicalJson(parseEdition(edition));
    delete (globalThis as { structuredClone?: unknown }).structuredClone;
    vi.resetModules();
    const fresh = await import("./bridge");
    expect(typeof globalThis.structuredClone).toBe("function");
    value(fresh.setEdition(JSON.stringify(edition)));
    expect(value<string>(fresh.canonicalEdition())).toBe(native);
  });

  it("the edition body hashes to the edition id", () => {
    const info = value<{ editionId: string; destinations: Array<{ code: string; name: string }> }>(BYT.setEdition(JSON.stringify(edition)));
    const body = value<string>(BYT.editionBodyCanonical());
    expect("byt-" + createHash("sha256").update(body, "utf8").digest("hex").slice(0, 12)).toBe(info.editionId);
    expect(info.destinations.length).toBe(Object.keys(edition.destinations).length);
  });

  it("gives the read contract and label tags the engine gives", () => {
    value(BYT.setEdition(JSON.stringify(edition)));
    const contract = value<{ fields: Array<{ name: string }>; schema: object; labelTextMax: number }>(BYT.itemReadContract());
    expect(contract.fields.map((f) => f.name)).toEqual(ITEM_READ_FIELDS.map((f) => f.name));
    expect(contract.labelTextMax).toBe(LABEL_TEXT_MAX);
    const ed = parseEdition(edition);
    for (const label of ["LI-ION 3.7V 5000mAh", "PERFUME \"EAU\" 50 ml\nALCOHOL", "a\\b c </script>", "AEROSOL SPRAY"]) {
      expect(value<string[]>(BYT.labelTagsJson(label)), label).toEqual(labelTagsOf(label, ed));
    }
  });
});
