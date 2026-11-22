import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import edition from "../../rules/edition.json";
import box from "../../tests/vectors/box.json";
import guards from "../../tests/vectors/box-guards.json";
import defaults from "../../tests/vectors/defaults.json";
import destinations from "../../tests/vectors/destinations.json";
import { canonicalJson, parseEdition } from "../engine/edition";
import { deriveFacts, labelTagsOf } from "../engine/facts";
import type { BoxItemInput, RuleHit } from "../engine/types";
import type { BoxResult } from "../engine/verdict";
import { ITEM_READ_FIELDS, LABEL_TEXT_MAX, type ItemRead } from "../shared/itemRead";
import { isNoItem } from "../shared/noItem";
import { mergeReads, needsSecondLook, readDisputes, SECOND_LOOK_DEFAULT } from "../shared/secondLook";
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

  it("tags the whole label when it parses a read, so a word past the cap counts and a cut never makes one", () => {
    value(BYT.setEdition(JSON.stringify(edition)));
    const today = box[0]!.today;
    const lotion = { ...defaults.baseRead, itemName: "Lotion", category: "lotion_cream", liquid: true, retailBox: "sealed", evidence: "label_read" };
    const parsed = (labelText: string) =>
      value<{ read: ItemRead; labelTags: string[] }>(BYT.parseItemReadTaggedJson(JSON.stringify({ ...lotion, labelText })));
    const level = (p: { read: ItemRead; labelTags: string[] }) => {
      const input = { items: [{ ...item({ itemId: "a", read: p.read as unknown as Record<string, unknown> }), labelTags: p.labelTags }], code: "CA", today };
      return value<BoxResult>(BYT.evaluateBoxJson(JSON.stringify(input))).items.a?.level;
    };
    // The same lotion with no hazard word is OK, so the checks below are not vacuous.
    expect(level(parsed(`${"x".repeat(155)} LOTION`))).toBe("ok");
    const past = parsed(`${"x".repeat(155)} FLAMMABLE`);
    expect(Array.from(past.read.labelText)).toHaveLength(LABEL_TEXT_MAX);
    expect(past.read.labelText).not.toContain("FLAMMABLE");
    expect(past.labelTags).toEqual(expect.arrayContaining(["flammable", "label_text"]));
    expect(level(past)).not.toBe("ok");
    // The cap falls right after FLAMMABLE in FLAMMABLE-FREE: the whole label says it is not flammable.
    const cut = parsed(`${"x".repeat(150)} FLAMMABLE-FREE LOTION`);
    expect(cut.read.labelText.endsWith("FLAMMABLE")).toBe(true);
    expect(cut.labelTags).not.toContain("flammable");
    expect(level(cut)).toBe("ok");
  });

  it("gives the web app's second-look reason for an on-device read, from the edition in force", () => {
    value(BYT.setEdition(JSON.stringify(edition)));
    const loaded = parseEdition(edition);
    const reason = (input: unknown) => value<{ reason: string | null }>(BYT.secondLookReasonJson(JSON.stringify(input))).reason;
    // Every shared vector item, on the device and in the cloud, gives what the web app's own rule gives.
    let checked = 0;
    for (const v of box as unknown as BoxVector[]) {
      for (const raw of v.items) {
        const it = item(raw);
        for (const source of ["on_device", "in_cloud"]) {
          const web = needsSecondLook(deriveFacts(it as unknown as BoxItemInput, loaded), { source }, SECOND_LOOK_DEFAULT);
          expect(reason({ item: it, source }), `${v.name} ${raw.itemId} ${source}`).toBe(web);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
    // Named cases, so the comparison above is not vacuous.
    const powerBank = item({ itemId: "p", read: { category: "power_bank", volts: 3.7, milliampHours: 10000, wattHours: 37, batteryWords: true } });
    expect(reason({ item: powerBank, source: "on_device" })).toBe("battery_numbers");
    expect(reason({ item: powerBank, source: "in_cloud" })).toBeNull();
    const seenPerfume = item({ itemId: "f", read: { category: "perfume_fragrance", evidence: "item_seen", liquid: true } });
    expect(reason({ item: seenPerfume, source: "on_device" })).not.toBeNull();
    // A lotion whose label was read (its tags are the engine's for that label) needs no second look.
    const lotion = { ...item({ itemId: "l", read: { category: "lotion_cream", labelText: "SHEA BODY LOTION", liquid: true } }),
      labelTags: labelTagsOf("SHEA BODY LOTION", loaded) };
    expect(reason({ item: lotion, source: "on_device" })).toBeNull();
    // The policy can turn a reason off, and a malformed policy is refused rather than read as all on.
    // Battery numbers off: the next reason in the web app's order applies (no label was read, so identity).
    expect(reason({ item: powerBank, source: "on_device", policy: { ...SECOND_LOOK_DEFAULT, batteryNumbers: false } })).toBe("identity");
    const allOff = { whMismatch: false, batteryNumbers: false, notSure: false, hazardNoLabel: false, identity: false };
    expect(reason({ item: powerBank, source: "on_device", policy: allOff })).toBeNull();
    expect(reply(BYT.secondLookReasonJson(JSON.stringify({ item: powerBank, source: "on_device", policy: { batteryNumbers: "no" } }))).ok).toBe(false);
    expect(reply(BYT.secondLookReasonJson(JSON.stringify({ item: { ...powerBank, quantity: "2" }, source: "on_device" }))).ok).toBe(false);
  });

  it("merges a second look and lists its disputes as the web app does, and refuses a malformed read", () => {
    const device = { ...defaults.baseRead, itemName: "Power bank", category: "power_bank", volts: 3.7, milliampHours: 10000,
      batteryWords: true, retailBox: "sealed", evidence: "label_read" } as ItemRead;
    const cloud = { ...defaults.baseRead, itemName: "Battery pack", category: "power_bank", volts: 3.7, milliampHours: 20000,
      wattHours: 74, batteryWords: true, retailBox: "open_or_none", evidence: "item_seen", labelText: "20000mAh 74Wh" } as ItemRead;
    const out = value<{ merged: ItemRead; disputes: unknown; sameCategory: boolean }>(BYT.mergeSecondLookJson(JSON.stringify({ device, cloud })));
    expect(out.merged).toEqual(mergeReads(device, cloud));
    expect(out.disputes).toEqual(readDisputes(device, cloud));
    expect(Object.keys(out.disputes as object).length).toBeGreaterThan(0);
    expect(out.sameCategory).toBe(true);
    const other = value<{ sameCategory: boolean }>(BYT.mergeSecondLookJson(JSON.stringify({ device, cloud: { ...cloud, category: "phone" } })));
    expect(other.sameCategory).toBe(false);
    const bad = reply(BYT.mergeSecondLookJson(JSON.stringify({ device, cloud: { ...cloud, volts: -1 } })));
    expect(bad.ok).toBe(false);
    expect(reply(BYT.mergeSecondLookJson(JSON.stringify({ device }))).ok).toBe(false);
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

  it("finds a read of no item with the web app's own check, and refuses a malformed read", () => {
    const read = (patch: Partial<ItemRead> = {}): ItemRead => ({
      itemName: "unknown", category: "other", labelText: "", volts: 0, milliampHours: 0, wattHours: 0, lithiumGrams: 0,
      batteryWords: false, liquid: false, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false,
      glassContainer: false, powder: false, retailBox: "cannot_tell", evidence: "not_sure", ...patch,
    });
    const reads = [read(), read({ itemName: "" }), read({ itemName: "No item" }), read({ itemName: "small box" }),
      read({ category: "power_bank" }), read({ evidence: "item_seen" }), read({ labelText: "50000mAh" }), read({ liquid: true })];
    for (const r of reads) expect(value<boolean>(BYT.isNoItemJson(JSON.stringify(r))), r.itemName).toBe(isNoItem(r));
    expect(value<boolean>(BYT.isNoItemJson(JSON.stringify(read())))).toBe(true);
    expect(value<boolean>(BYT.isNoItemJson(JSON.stringify(read({ liquid: true }))))).toBe(false);
    expect(reply(BYT.isNoItemJson("{}")).ok).toBe(false);
  });

  it("refuses a malformed item instead of judging it", () => {
    value(BYT.setEdition(JSON.stringify(edition)));
    const lotion = (box as unknown as BoxVector[]).find((v) => v.name === "lotion_ca")!;
    const good = item(lotion.items[0]!);
    const send = (items: unknown[]) => reply(BYT.evaluateBoxJson(JSON.stringify({ items, code: lotion.code, today: lotion.today })));
    expect(send([good]).ok).toBe(true);
    expect(send([{ ...good, overrides: { volts: "3.7" } }]).ok, "typed text in a number override is the engine's to judge").toBe(true);
    expect(send([{ ...good, read: { ...good.read, labelText: "\u{1F600}".repeat(160) } }]).ok, "160 characters, counted as the parser counts them").toBe(true);
    expect(send([{ ...good, overrides: { labelText: "y".repeat(400) } }]).ok, "a typed label has no length limit on the web either").toBe(true);
    expect(send([{ ...good, numbersFrom: "typed" }]).ok, "a typed item says so").toBe(true);
    expect(send([{ ...good, numbersFrom: "read" }]).ok).toBe(true);
    expect(send([{ ...good, labelFigures: { wh: [185], grams: [] } }]).ok, "the figures a label named").toBe(true);
    const open = send([{ ...good, disputes: { lithiumGrams: { device: 2.5, cloud: 0, resolved: false } } }]);
    expect(open.ok && (open.value as { items: Record<string, { level: string }> }).items[good.itemId]?.level, "an open dispute holds the item").toBe("check");
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
      ["a negative number in the read (the web parser refuses it)", { ...good, read: { ...good.read, wattHours: -150 } }],
      ["a negative number override", { ...good, overrides: { milliampHours: -4000 } }],
      ["read label text past the contract's 160 characters", { ...good, read: { ...good.read, labelText: "x".repeat(160) + " ALCOHOL" } }],
      ["disputes not an object", { ...good, disputes: [] }],
      ["a dispute on an unknown fact", { ...good, disputes: { colour: { device: "red", cloud: "blue", resolved: false } } }],
      ["a dispute with no resolved flag", { ...good, disputes: { category: { device: "phone", cloud: "tablet" } } }],
      ["numbersFrom not typed or read", { ...good, numbersFrom: "mixed" }],
      ["numbersFrom not text", { ...good, numbersFrom: true }],
      ["labelFigures with text", { ...good, labelFigures: { wh: ["185"], grams: [] } }],
      ["labelFigures with a zero", { ...good, labelFigures: { wh: [0], grams: [] } }],
      ["labelFigures missing grams", { ...good, labelFigures: { wh: [185] } }],
      ["labelFigures with another key", { ...good, labelFigures: { wh: [], grams: [], mah: [5000] } }],
      ["labelFigures with nine figures", { ...good, labelFigures: { wh: [1, 2, 3, 4, 5, 6, 7, 8, 9], grams: [] } }],
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
