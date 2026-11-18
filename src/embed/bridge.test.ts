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

  it("refuses a malformed item instead of judging it", () => {
    value(BYT.setEdition(JSON.stringify(edition)));
    const lotion = (box as unknown as BoxVector[]).find((v) => v.name === "lotion_ca")!;
    const good = item(lotion.items[0]!);
    const send = (items: unknown[]) => reply(BYT.evaluateBoxJson(JSON.stringify({ items, code: lotion.code, today: lotion.today })));
    expect(send([good]).ok).toBe(true);
    expect(send([{ ...good, overrides: { volts: "3.7" } }]).ok, "typed text in a number override is the engine's to judge").toBe(true);
    const noEvidence: Record<string, unknown> = { ...good.read };
    delete noEvidence.evidence;
    const bad: Array<[string, unknown]> = [
      ["category typo", { ...good, read: { ...good.read, category: "lotion_creem" } }],
      ["no evidence", { ...good, read: noEvidence }],
      ["truthy identity", { ...good, identityConfirmedBy: true }],
      ["text quantity", { ...good, quantity: "2" }],
      ["tags not a list", { ...good, labelTags: "alcoholic_drink" }],
      ["answer not text", { ...good, answers: { label_alcohol: 1 } }],
      ["override of an unknown field", { ...good, overrides: { colour: "red" } }],
      ["override with a bad value", { ...good, overrides: { category: "lotion_creem" } }],
      ["text volts in the read itself", { ...good, read: { ...good.read, volts: "3.7" } }],
    ];
    for (const [why, it] of bad) {
      const r = send([it]);
      expect(r.ok, why).toBe(false);
      if (!r.ok) expect(r.error.name, why).toBe("BadInputError");
    }
    // JSON text can carry a number too large for a double; JSON.parse makes it Infinity.
    const huge = JSON.stringify({ items: [{ ...good, read: { ...good.read, volts: 7 } }], code: lotion.code, today: lotion.today })
      .replace('"volts":7', '"volts":1e400');
    const r = reply(BYT.evaluateBoxJson(huge));
    expect(r.ok, "infinite volts").toBe(false);
  });

  it("refuses duplicate or reserved item ids", () => {
    value(BYT.setEdition(JSON.stringify(edition)));
    const lotion = (box as unknown as BoxVector[]).find((v) => v.name === "lotion_ca")!;
    const one = item(lotion.items[0]!);
    for (const items of [[{ ...one, itemId: "x" }, { ...one, itemId: "x" }], [{ ...one, itemId: "__proto__" }], [{ ...one, itemId: "" }]]) {
      const r = reply(BYT.evaluateBoxJson(JSON.stringify({ items, code: lotion.code, today: lotion.today })));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.name).toBe("BadInputError");
    }
  });

  it("the structuredClone stand-in keeps what the native clone keeps", async () => {
    const data = JSON.parse('{"a":1,"b":[1,2],"c":{"__proto__":{"x":1}},"d":null}') as Record<string, unknown>;
    Object.assign(data, { inf: Infinity, ninf: -Infinity, nan: NaN, undef: undefined, nested: { list: [Infinity, NaN] } });
    const want = original(data);
    delete (globalThis as { structuredClone?: unknown }).structuredClone;
    vi.resetModules();
    await import("./bridge");
    const shim = globalThis.structuredClone;
    expect(shim).not.toBe(original);
    const got = shim(data);
    expect(got).toStrictEqual(want);
    expect(got).not.toBe(data);
    expect(Object.prototype.hasOwnProperty.call(got.c, "__proto__")).toBe(true);
  });

  it("refuses destination facts whose tags or answers are not what the engine expects", () => {
    value(BYT.setEdition(JSON.stringify(edition)));
    const facts = structuredClone(defaults.baseFacts);
    const send = (input: unknown) => reply(BYT.destinationHitsJson(JSON.stringify(input)));
    expect(send({ facts: { ...facts, tags: ["non_alcoholic_drink"] }, answers: {}, code: "CA" }).ok).toBe(true);
    for (const [why, input] of [
      ["tags as one string", { facts: { ...facts, tags: "non_alcoholic_drink" }, answers: {}, code: "CA" }],
      ["a tag that is not text", { facts: { ...facts, tags: [7] }, answers: {}, code: "CA" }],
      ["an answer that is not text", { facts: { ...facts, tags: [] }, answers: { label_alcohol: true }, code: "CA" }],
      ["an unknown category", { facts: { ...facts, category: "lotion_creem" }, answers: {}, code: "CA" }],
    ] as Array<[string, unknown]>) {
      const r = send(input);
      expect(r.ok, why).toBe(false);
      if (!r.ok) expect(r.error.name, why).toBe("BadInputError");
    }
  });
});
