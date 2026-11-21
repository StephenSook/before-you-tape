import { describe, expect, it, vi } from "vitest";
import type { ReadOutcome } from "../ai/itemRead";
import { mergeReads, readDisputes } from "../ai/secondLook";
import type { InferenceSourceName } from "../ai/port";
import type { ItemRead } from "../shared/itemRead";
import { ed } from "../../tests/engine/helpers";
import type { BoxMeta, BoxOps, LoadResult } from "./boxOps";
import { createBoxStore, type BoxItem, type BoxState } from "./boxStore";
import { deviceConsent } from "./deviceConsent";

const base: ItemRead = {
  itemName: "Item", category: "other", labelText: "", volts: 0, milliampHours: 0, wattHours: 0, lithiumGrams: 0,
  batteryWords: false, liquid: false, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false,
  glassContainer: false, powder: false, retailBox: "cannot_tell", evidence: "label_read",
};
const liquidLotionRead: ItemRead = { ...base, itemName: "Body lotion", category: "lotion_cream", labelText: "SHEA BODY LOTION 8 FL OZ", liquid: true };
const liquidLotionLabelRead = liquidLotionRead;
const shirtRead: ItemRead = { ...base, itemName: "Shirt", category: "clothing", labelText: "" , evidence: "item_seen" };
const shirtSeenRead: ItemRead = { ...shirtRead };
const perfumeLabelRead: ItemRead = { ...base, itemName: "Perfume", category: "perfume_fragrance", labelText: "EAU DE PARFUM ALCOHOL DENAT 50 ML", liquid: true };
const oneCellPhoneRead: ItemRead = {
  ...base, itemName: "Phone", category: "phone", labelText: "LI-ION 3.85V 4000mAh 15.4Wh", volts: 3.85, milliampHours: 4000, wattHours: 15.4,
  batteryWords: true, retailBox: "sealed",
};

const outcome = (read: ItemRead, source: InferenceSourceName): ReadOutcome => ({ read, source, ms: 1200, route: "hybrid", recoveredFrom: null });
// A server for the box in memory: each operation changes it, and saved() reads what it holds.
const spyPersistence = (loaded: Partial<BoxState> | null = null) => {
  let box: Partial<BoxState> | null = loaded ? { ...loaded, items: [...(loaded.items ?? [])] } : null;
  return {
    loadBox: vi.fn<(boxId: string) => Promise<LoadResult>>(async () => (box ? { status: "found", box: structuredClone(box) } : { status: "missing" })),
    putMeta: vi.fn<(boxId: string, meta: BoxMeta) => Promise<void>>(async (_b, meta) => { box = { ...(box ?? { items: [] }), ...meta }; }),
    putItem: vi.fn<(boxId: string, item: BoxItem) => Promise<void>>(async (_b, item) => {
      const items = box?.items ?? [];
      box = { ...(box ?? {}), items: items.some((i) => i.itemId === item.itemId) ? items.map((i) => (i.itemId === item.itemId ? item : i)) : [...items, item] };
    }),
    deleteItem: vi.fn<(boxId: string, itemId: string) => Promise<void>>(async (_b, itemId) => { box = { ...(box ?? {}), items: (box?.items ?? []).filter((i) => i.itemId !== itemId) }; }),
    saved: () => box,
  } satisfies BoxOps & { saved: () => Partial<BoxState> | null };
};
const writes = (p: ReturnType<typeof spyPersistence>) => p.putMeta.mock.calls.length + p.putItem.mock.calls.length + p.deleteItem.mock.calls.length;
let ids = 0;
const store = (o: { persistence?: BoxOps } = {}) => createBoxStore({
  edition: () => ed, persistence: o.persistence ?? spyPersistence(), now: () => 1000, today: () => "2026-11-20", newId: () => `id-${ids++}`,
});

const phoneItem: BoxItem = {
  itemId: "phone-1", read: { ...shirtRead, evidence: "label_read", labelText: "" }, overrides: {}, answers: {}, quantity: 1,
  identityConfirmedBy: null, labelTags: ["label_text"], readSource: "phone_cloud", readMs: 2100, secondLook: null, cropKey: null,
  customs: { description: "", lintOk: false, weightOz: null, valueUsd: null, countryOfOrigin: null, upc: null },
};
const savedItemWithOldVerdict: BoxItem = { ...phoneItem, itemId: "saved-1", readSource: "on_device" };

describe("createBoxStore", () => {
  it("re-checks on a country change with no model call", () => {
    const s = store();
    s.setDestination("CA");
    const id = s.addManual(liquidLotionRead);
    expect(s.getState().result.items[id]?.headline).toBe("OK to pack");
    const rechecks = s.getState().sources.rulesOnlyRechecks;
    s.setDestination("PH");
    expect(s.getState().result.items[id]?.headline).toBe("Take it out");
    expect(s.getState().sources.rulesOnlyRechecks).toBe(rechecks + 1);
  });

  it("keeps the re-check time only until the box changes, so it never describes a later read", () => {
    const s = store();
    s.setDestination("CA");
    s.addManual(liquidLotionRead);
    s.setDestination("PH");
    expect(s.getState().lastRecheckMs).not.toBeNull();
    s.addRead(outcome(shirtRead, "in_cloud"), "crop-1");
    expect(s.getState().lastRecheckMs).toBeNull();
    s.setDestination("CA");
    s.addManual(shirtRead);
    expect(s.getState().lastRecheckMs).toBeNull();
  });

  it("keeps what the sender ticked on a typed item as their own word, so a ticked alcohol line is not asked again", () => {
    const s = store();
    const id = s.addManual({ ...perfumeLabelRead, labelText: "", alcoholOnLabel: true });
    expect(s.getState().items[0]?.overrides).toEqual({ alcoholOnLabel: true });
    expect(s.getState().result.items[id]?.level).toBe("take_out");
    expect(s.getState().result.items[id]?.question).toBeNull();
  });

  it("late read uses current destination", () => {
    const s = store();
    s.setDestination("PH");
    const id = s.addRead(outcome(liquidLotionLabelRead, "on_device"), "k");
    expect(s.getState().result.items[id]?.headline).toBe("Take it out");
  });

  it("treats a hand-added item as sender-confirmed and an agreeing second look as confirmed", () => {
    const s = store();
    s.addManual(shirtRead);
    expect(s.getState().items[0]?.identityConfirmedBy).toBe("sender");
    const b = s.addRead(outcome(shirtSeenRead, "on_device"), "k");
    s.applySecondLook(b, shirtSeenRead, 900, "identity");
    expect(s.getState().items[1]?.identityConfirmedBy).toBe("second_look");
  });

  it("does not confirm identity when the second look sees a different item", () => {
    const s = store();
    const b = s.addRead(outcome(shirtSeenRead, "on_device"), "k");
    s.applySecondLook(b, { ...shirtSeenRead, category: "toy" }, 900, "identity");
    expect(s.getState().items[0]?.identityConfirmedBy).toBeNull();
    expect(s.getState().items[0]?.read.category).toBe("toy");
    expect(s.getState().sources.secondLooks).toBe(1);
  });

  it("hands persistence an item with no label text and with its label tags", async () => {
    const p = spyPersistence();
    const s = store({ persistence: p });
    s.addRead(outcome(perfumeLabelRead, "on_device"), "k");
    await s.settled();
    const saved = p.saved()!.items![0]!;
    expect(saved.read.labelText).toBe("");
    expect(saved.labelTags).toContain("alcohol");
    expect(s.getState().items[0]?.read.labelText).toBe(perfumeLabelRead.labelText);
  });

  it("keeps a corrected label's tags when the corrected text itself is not saved", async () => {
    const p = spyPersistence();
    const s = store({ persistence: p });
    const id = s.addRead(outcome({ ...base, category: "lotion_cream", labelText: "BODY LOTION" }, "on_device"), "k");
    s.override(id, { labelText: "BODY LOTION ALCOHOL DENAT 8 FL OZ" });
    await s.settled();
    const saved = p.saved()!.items![0]!;
    expect(saved.overrides.labelText).toBeUndefined();
    expect(saved.labelTags).toEqual(expect.arrayContaining(["alcohol", "liquid"]));
  });

  it("stamps each new item with the time it was added", () => {
    let t = 1_795_000_000_000;
    const s = createBoxStore({ edition: () => ed, persistence: spyPersistence(), now: () => 1000, today: () => "2026-11-20", newId: () => `id-${ids++}`, clock: () => t++ });
    s.addManual(shirtRead);
    s.addRead(outcome(liquidLotionRead, "in_cloud"), "crop-1");
    expect(s.getState().items.map((i) => i.addedAt)).toEqual([1_795_000_000_000, 1_795_000_000_001]);
  });

  it("shows saved items in the order they were added, whatever order the server returns them in", async () => {
    const at = (itemId: string, addedAt?: number): BoxItem => ({ ...phoneItem, itemId, ...(addedAt === undefined ? {} : { addedAt }) });
    const s = store({ persistence: spyPersistence({ items: [at("c", 30), at("old"), at("a", 10), at("b", 20)] }) });
    await s.ready;
    expect(s.getState().items.map((i) => i.itemId)).toEqual(["a", "b", "c", "old"]);
  });

  it("merges a remote item once", () => {
    const s = store();
    s.mergeRemoteItem(phoneItem);
    s.mergeRemoteItem(phoneItem);
    expect(s.getState().items).toHaveLength(1);
    expect(s.getState().items[0]?.readSource).toBe("phone_cloud");
    s.mergeRemoteItem({ ...phoneItem, itemId: "phone-2", readSource: "phone_on_device" });
    expect(s.getState().items.map((i) => i.readSource)).toEqual(["phone_cloud", "phone_on_device"]);
  });

  it("clamps quantity to 1 through 99 and feeds the lithium count", () => {
    const s = store();
    const id = s.addManual(oneCellPhoneRead);
    s.answer(id, "cell_count", "one");
    s.setQuantity(id, 5);
    expect(s.getState().result.lithium.status).toBe("over");
    s.setQuantity(id, 0);
    expect(s.getState().items[0]?.quantity).toBe(1);
    s.setQuantity(id, 500);
    expect(s.getState().items[0]?.quantity).toBe(99);
    s.setQuantity(id, Number.NaN);
    expect(s.getState().items[0]?.quantity).toBe(1);
  });

  it("re-evaluates saved items on load", async () => {
    const s = store({ persistence: spyPersistence({ items: [savedItemWithOldVerdict], destinationCode: "PH", cloudConsent: true }) });
    await s.ready;
    expect(s.getState().result.editionId).toBe(ed.editionId);
    expect(s.getState().items.map((i) => i.itemId)).toEqual(["saved-1"]);
    expect(s.getState().result.items["saved-1"]).toBeDefined();
    expect(s.getState().destinationCode).toBe("PH");
    // An answer an older version saved on the box is ignored: consent is this device's own.
    expect(s.getState().cloudConsent).toBeNull();
  });

  it("clears the item's error when a second look then succeeds", () => {
    const s = store();
    const id = s.addRead(outcome(shirtSeenRead, "on_device"), "k");
    s.setError(id, "No connection. This check will run when you are back online.");
    expect(s.getState().errors[id]).toMatch(/No connection/);
    s.applySecondLook(id, shirtSeenRead, 900, "The first read could not confirm what this is, so the cloud looked again.");
    expect(s.getState().errors[id]).toBeUndefined();
    expect(s.getState().items[0]?.secondLook).toEqual({ ms: 900, reason: "The first read could not confirm what this is, so the cloud looked again." });
    expect(s.getState().sources.secondLooks).toBe(1);
  });

  it("switches to a newer edition and judges the box again with it", () => {
    const s = store();
    s.addRead(outcome(liquidLotionLabelRead, "on_device"), "k");
    const before = s.getState().result;
    const seen = vi.fn();
    s.subscribe(seen);
    const code = s.getState().destinationCode;
    const newer = { ...ed, editionId: "byt-newer000001", destinations: { ...ed.destinations, [code]: { ...ed.destinations[code]!, checkedOn: "2026-11-25" } } };
    s.setEdition(newer);
    expect(s.edition().editionId).toBe("byt-newer000001");
    expect(seen).toHaveBeenCalledTimes(1);
    expect(s.getState().result).not.toBe(before);
    expect(s.getState().result.items[s.getState().items[0]!.itemId]?.layers.some((l) => l.checkedOn === "2026-11-25")).toBe(true);
  });

  it("records a fallback model read on the item with its route, and counts it on the box", () => {
    const s = store();
    const a = s.addRead({ ...outcome(shirtSeenRead, "in_cloud"), route: "cloud_only", fallbackAfter: "503" }, "a");
    const b = s.addRead(outcome(shirtSeenRead, "in_cloud"), "b");
    const item = (id: string) => s.getState().items.find((i) => i.itemId === id);
    expect(item(a)?.readFallback).toEqual({ after: "503", route: "cloud_only" });
    expect(item(b)?.readFallback).toBeUndefined();
    expect(s.getState().sources).toMatchObject({ inCloud: 2, cloudFallbacks: 1 });
  });

  it("starts the fallback count at 0 for a box saved before the count existed", async () => {
    const s = store({ persistence: spyPersistence({ sources: { onDevice: 2, inCloud: 1, secondLooks: 0, rulesOnlyRechecks: 0 } as BoxState["sources"] }) });
    await s.ready;
    s.addRead({ ...outcome(shirtSeenRead, "in_cloud"), fallbackAfter: "500" }, "a");
    expect(s.getState().sources).toEqual({ onDevice: 2, inCloud: 2, secondLooks: 0, rulesOnlyRechecks: 0, cloudFallbacks: 1 });
  });

  it("counts reads by where they ran and tells subscribers about every change", () => {
    const s = store();
    const seen = vi.fn();
    const off = s.subscribe(seen);
    s.addRead(outcome(shirtSeenRead, "on_device"), "a");
    s.addRead(outcome(shirtSeenRead, "in_cloud"), "b");
    expect(s.getState().sources).toMatchObject({ onDevice: 1, inCloud: 1 });
    expect(seen).toHaveBeenCalledTimes(2);
    const c = s.addRead({ ...outcome(shirtSeenRead, "in_cloud"), unreported: true }, "c");
    expect(s.getState().items.find((i) => i.itemId === c)?.readSource).toBe("cloud_unreported");
    expect(s.getState().sources).toMatchObject({ onDevice: 1, inCloud: 2 });
    off();
    s.setConsent(false);
    expect(seen).toHaveBeenCalledTimes(3);
    expect(s.getState().cloudConsent).toBe(false);
  });

  it("never saves an item's own name: Firestore gets its category's label, and the real names stay on this device", async () => {
    const lotion: ItemRead = { ...liquidLotionLabelRead, itemName: "SHEA BUTTER BODY LOTION FROM ACME" };
    const remembered: Record<string, Record<string, { read: string; override?: string }>> = {};
    const deviceNames = { remember: (boxId: string, names: Record<string, { read: string; override?: string }>) => { remembered[boxId] = { ...names }; }, recall: (boxId: string) => remembered[boxId] ?? {} };
    const persistence = spyPersistence();
    const s = createBoxStore({ edition: () => ed, persistence, now: () => 1000, today: () => "2026-11-20", newId: () => `id-${ids++}`, boxId: "names-box", deviceNames });
    s.setConsent(true);
    const read = s.addRead(outcome(lotion, "on_device"), "k");
    const typed = s.addManual({ ...lotion, itemName: "My aunt's lotion" });
    // A correction that names it and changes its kind: the label follows the corrected kind.
    s.override(read, { itemName: "Grandma's rose water", category: "perfume_fragrance" });
    await s.settled();
    const saved = () => persistence.saved()?.items ?? [];
    expect(saved().find((i) => i.itemId === read)?.read.itemName).toBe("Perfume or cologne");
    expect(saved().find((i) => i.itemId === typed)?.read.itemName).toBe("Lotion or cream");
    expect(saved().find((i) => i.itemId === read)?.overrides).not.toHaveProperty("itemName");
    const text = JSON.stringify(saved());
    for (const words of ["ACME", "aunt", "Grandma"]) expect(text).not.toContain(words);
    // This device keeps the real names, and a reload puts them back.
    expect(remembered["names-box"]?.[read]).toEqual({ read: lotion.itemName, override: "Grandma's rose water" });
    expect(remembered["names-box"]?.[typed]).toEqual({ read: "My aunt's lotion" });
    const back = createBoxStore({ edition: () => ed, persistence: spyPersistence({ items: saved() }), now: () => 1000, today: () => "2026-11-20", newId: () => `id-${ids++}`, boxId: "names-box", deviceNames });
    await back.ready;
    const again = back.getState().items.find((i) => i.itemId === read);
    expect(again?.read.itemName).toBe(lotion.itemName);
    expect(again?.overrides.itemName).toBe("Grandma's rose water");
    expect(back.getState().items.find((i) => i.itemId === typed)?.read.itemName).toBe("My aunt's lotion");
  });

  it("keeps the cloud answer on this device: starts from it, stores each change there, and saves no box for it", () => {
    localStorage.clear();
    const consent = deviceConsent(localStorage);
    consent.set(true);
    const persistence = spyPersistence();
    const s = createBoxStore({ edition: () => ed, persistence, now: () => 1000, today: () => "2026-11-20", newId: () => `id-${ids++}`, consent });
    expect(s.getState().cloudConsent).toBe(true);
    const saves = writes(persistence);
    s.setConsent(false);
    expect(consent.get()).toBe(false);
    expect(s.consentNow()).toBe(false);
    expect(writes(persistence)).toBe(saves);
    localStorage.clear();
  });

  it("hears another tab on this device change the answer, reads it fresh, and tells listeners", () => {
    localStorage.clear();
    const s = createBoxStore({ edition: () => ed, persistence: spyPersistence(), now: () => 1000, today: () => "2026-11-20", newId: () => `id-${ids++}`, consent: deviceConsent(localStorage) });
    s.setConsent(true);
    const heard = vi.fn();
    s.subscribe(heard);
    // The other tab's write is visible at once, before its event arrives.
    localStorage.setItem("byt.cloudConsent.v2", "false");
    expect(s.consentNow()).toBe(false);
    window.dispatchEvent(new StorageEvent("storage", { key: "byt.cloudConsent.v2", newValue: "false" }));
    expect(s.getState().cloudConsent).toBe(false);
    expect(heard).toHaveBeenLastCalledWith(expect.objectContaining({ cloudConsent: false }));
    localStorage.clear();
  });

  it("never loses a hazard word either read saw: a second look keeps the union of both labels' tags", () => {
    const lotion = { ...liquidLotionRead, flammableOnLabel: false };
    const flammable = { ...lotion, labelText: "FLAMMABLE BODY LOTION" };
    const plain = { ...lotion, labelText: "SHEA BUTTER MOISTURE BODY LOTION FOR DRY SKIN 8 FL OZ" };
    const levelOf = (s: ReturnType<typeof store>, id: string) => s.getState().result.items[id]?.level;
    // The flammable label alone is Take it out for Canada; the plain one is not.
    const alone = store();
    expect(levelOf(alone, alone.addRead(outcome(flammable, "on_device"), "k"))).toBe("take_out");
    // The device saw FLAMMABLE; the longer cloud label did not. And the other way round.
    for (const [device, cloud] of [[flammable, plain], [plain, flammable]] as const) {
      const s = store();
      const id = s.addRead(outcome(device, "on_device"), "k");
      s.applySecondLook(id, mergeReads(device, cloud), 900, "reason", cloud.labelText);
      expect(levelOf(s, id), `device "${device.labelText}", cloud "${cloud.labelText}"`).toBe("take_out");
    }
  });

  it("tags the whole label a read returned, so a hazard word past the clipped text still counts", () => {
    const label = `SHEA BUTTER BODY LOTION ${"FOR VERY DRY SKIN ".repeat(8)}EXTREMELY FLAMMABLE`;
    const read = { ...liquidLotionRead, labelText: Array.from(label).slice(0, 160).join("") };
    expect(read.labelText).not.toContain("FLAMMABLE");
    const s = store();
    const id = s.addRead({ ...outcome(read, "on_device"), fullLabelText: label }, "k");
    expect(s.getState().items[0]?.labelTags).toContain("flammable");
    expect(s.getState().result.items[id]?.level).toBe("take_out");
  });

  it("keeps a label correction made while the second look ran, so a reload gives the same verdict", async () => {
    const flammable = { ...liquidLotionRead, labelText: "FLAMMABLE BODY LOTION" };
    const p = spyPersistence();
    const s = store({ persistence: p });
    // Canada, where an unflammable body lotion is OK to pack.
    s.setDestination("CA");
    const id = s.addRead(outcome(flammable, "on_device"), "k");
    // The sender corrects the label while the cloud read is out; the cloud then reads FLAMMABLE as well.
    s.override(id, { labelText: "SHEA BODY LOTION 8 FL OZ" });
    s.applySecondLook(id, mergeReads(flammable, flammable), 900, "reason", flammable.labelText);
    const before = s.getState().result.items[id]?.level;
    expect(before).not.toBe("take_out");
    await s.settled();
    const saved = p.saved()!;
    expect(saved.items?.[0]?.labelTags).not.toContain("flammable");
    const reloaded = store({ persistence: spyPersistence(saved) });
    await reloaded.ready;
    expect(reloaded.getState().result.items[id]?.level).toBe(before);
  });

  describe("a second look whose two reads disagree", () => {
    // A label with no "power bank" words, so only the category tells the two reads apart.
    const powerBank: ItemRead = { ...base, itemName: "Power bank", category: "power_bank", labelText: "LI-ION 3.7V 5000mAh 18.5Wh",
      volts: 3.7, milliampHours: 5000, wattHours: 18.5, batteryWords: true, retailBox: "sealed" };
    const level = (s: ReturnType<typeof store>, id: string) => s.getState().result.items[id]?.level;
    // Adds the device read, answers as a sender would, then lands the second look.
    const look = (device: ItemRead, cloud: ItemRead, withDisputes = true, p?: BoxOps) => {
      const s = store(p ? { persistence: p } : {});
      // Canada, where these items are OK to pack once their reads agree.
      s.setDestination("CA");
      const id = s.addRead(outcome(device, "on_device"), "k");
      s.answer(id, "device_condition", "new_sealed");
      s.answer(id, "cell_count", "one");
      s.applySecondLook(id, mergeReads(device, cloud), 900, "reason", cloud.labelText, withDisputes ? readDisputes(device, cloud) : {});
      return { s, id };
    };

    it("holds a power bank read as a phone at Check this, where the cloud's category alone said OK", () => {
      const phone = { ...powerBank, itemName: "Phone", category: "phone" as const };
      const control = look(powerBank, phone, false);
      expect(level(control.s, control.id)).toBe("ok");
      const { s, id } = look(powerBank, phone);
      expect(level(s, id)).toBe("check");
      expect(s.getState().result.items[id]?.hits.map((h) => h.ruleId)).toContain("DATA-DISPUTE");
      expect(s.getState().items[0]?.disputes?.category).toEqual({ device: "power_bank", cloud: "phone", resolved: false });
    });

    it("never lets an open-and-sealed reading, a 95 or 105 Wh reading, or 2.5 g against 0 g end at OK", () => {
      const phone: ItemRead = { ...powerBank, itemName: "Phone", category: "phone", labelText: "3.85V 4000mAh 15.4Wh", volts: 3.85, milliampHours: 4000, wattHours: 15.4 };
      const box = look({ ...phone, retailBox: "open_or_none" }, phone);
      expect(level(box.s, box.id)).not.toBe("ok");
      expect(box.s.getState().items[0]?.read.retailBox).toBe("open_or_none");
      const wh = look({ ...powerBank, volts: 3.7, milliampHours: 25675, wattHours: 95 }, { ...powerBank, volts: 3.6, milliampHours: 25675, wattHours: 105 });
      expect(level(wh.s, wh.id)).not.toBe("ok");
      expect(wh.s.getState().items[0]?.read.wattHours).toBe(105);
      const grams = look({ ...phone, lithiumGrams: 2.5 }, phone);
      expect(level(grams.s, grams.id)).not.toBe("ok");
      expect(grams.s.getState().items[0]?.read.lithiumGrams).toBe(2.5);
    });

    it("records a label word only one read saw as a dispute of tags, never of label text", () => {
      const lotion = { ...liquidLotionRead, flammableOnLabel: false };
      const { s } = look({ ...lotion, labelText: "FLAMMABLE BODY LOTION" }, { ...lotion, labelText: "SHEA BUTTER BODY LOTION 8 FL OZ" });
      const d = s.getState().items[0]?.disputes?.labelTags;
      expect(d?.device).toContain("flammable");
      expect(d?.cloud).not.toContain("flammable");
      expect(JSON.stringify(s.getState().items[0]?.disputes)).not.toMatch(/LOTION/);
    });

    it("raises no dispute on a fact the sender corrected while the cloud read ran", () => {
      const s = store();
      const id = s.addRead(outcome(powerBank, "on_device"), "k");
      s.override(id, { category: "power_bank", labelText: "POWER BANK 37Wh" });
      const phone = { ...powerBank, category: "phone" as const, labelText: "FLAMMABLE PHONE" };
      s.applySecondLook(id, mergeReads(powerBank, phone), 900, "reason", phone.labelText, readDisputes(powerBank, phone));
      expect(s.getState().items[0]?.disputes).toBeUndefined();
    });

    it("settles a dispute with the reading the sender picks, and judges that reading", () => {
      const phone = { ...powerBank, itemName: "Phone", category: "phone" as const };
      const { s, id } = look(powerBank, phone);
      s.settleDispute(id, "category", "device");
      const i = s.getState().items[0]!;
      expect(i.read.category).toBe("power_bank");
      // The card names the item as the picked read did, not as the other read did.
      expect(i.read.itemName).toBe("Power bank");
      expect(i.disputes?.category?.resolved).toBe(true);
      // Picking what the item is confirms it.
      expect(i.identityConfirmedBy).toBe("sender");
      expect(level(s, id)).toBe("take_out");
      const wh = look({ ...powerBank, volts: 3.7, milliampHours: 25675, wattHours: 95 }, { ...powerBank, volts: 3.6, milliampHours: 25675, wattHours: 105 });
      wh.s.settleDispute(wh.id, "battery", "device");
      expect(wh.s.getState().items[0]?.read).toMatchObject({ volts: 3.7, milliampHours: 25675, wattHours: 95 });
      expect(wh.s.getState().items[0]?.disputes?.battery?.resolved).toBe(true);
      // Picking a label brings back that read's label and its words, and only those.
      const lotion = { ...liquidLotionRead, flammableOnLabel: false };
      const lab = look({ ...lotion, labelText: "FLAMMABLE BODY LOTION" }, { ...lotion, labelText: "SHEA BUTTER BODY LOTION 8 FL OZ" });
      expect(level(lab.s, lab.id)).toBe("take_out");
      lab.s.settleDispute(lab.id, "labelTags", "cloud");
      expect(lab.s.getState().items[0]?.labelTags).not.toContain("flammable");
      expect(lab.s.getState().items[0]?.read.labelText).toBe("SHEA BUTTER BODY LOTION 8 FL OZ");
      expect(level(lab.s, lab.id)).toBe("ok");
      lab.s.settleDispute(lab.id, "labelTags", "device");
      expect(lab.s.getState().items[0]?.read.labelText).toBe("FLAMMABLE BODY LOTION");
      expect(level(lab.s, lab.id)).toBe("take_out");
    });

    it("judges the reading the sender picks, not an earlier correction of the same facts", () => {
      // A capacity corrected by hand, then the cloud's battery reading picked: the rules see the picked numbers only.
      const wh = look({ ...powerBank, volts: 3.7, milliampHours: 25675, wattHours: 95 }, { ...powerBank, volts: 3.6, milliampHours: 10000, wattHours: 37 });
      wh.s.override(wh.id, { milliampHours: 2500 });
      wh.s.settleDispute(wh.id, "battery", "cloud");
      const item = wh.s.getState().items[0]!;
      expect(item.overrides.milliampHours).toBeUndefined();
      expect(item.read).toMatchObject({ volts: 3.6, milliampHours: 10000, wattHours: 37 });
      // A picked label replaces a corrected label text; a picked fact replaces a correction of that fact only.
      const lotion = { ...liquidLotionRead, flammableOnLabel: false };
      const lab = look({ ...lotion, labelText: "FLAMMABLE BODY LOTION" }, { ...lotion, labelText: "SHEA BUTTER BODY LOTION 8 FL OZ" });
      lab.s.override(lab.id, { labelText: "TYPED BY HAND", liquid: false });
      lab.s.settleDispute(lab.id, "labelTags", "cloud");
      expect(lab.s.getState().items[0]?.overrides).toEqual({ liquid: false });
    });

    it("keeps a first read that was not sure at Check this when the cloud read the label", () => {
      const phone: ItemRead = { ...powerBank, itemName: "Phone", category: "phone" };
      const { s, id } = look({ ...phone, evidence: "not_sure" }, { ...phone, evidence: "label_read" });
      expect(level(s, id)).toBe("check");
      expect(s.getState().items[0]?.disputes?.evidence).toEqual({ device: "not_sure", cloud: "label_read", resolved: false });
      s.settleDispute(id, "evidence", "cloud");
      expect(s.getState().items[0]?.read.evidence).toBe("label_read");
      expect(level(s, id)).toBe("ok");
    });

    it("names the item by the picked category when this device no longer has that read's name", async () => {
      const phone = { ...powerBank, itemName: "Phone", category: "phone" as const };
      const p = spyPersistence();
      await look(powerBank, phone, true, p).s.settled();
      const saved = p.saved()!;
      const reloaded = store({ persistence: spyPersistence(saved) });
      await reloaded.ready;
      const id = reloaded.getState().items[0]!.itemId;
      reloaded.settleDispute(id, "category", "device");
      expect(reloaded.getState().items[0]?.read.itemName).toBe("Power bank");
    });

    it("never takes a hazard from the clipped label a second look shows", () => {
      const lotion = { ...liquidLotionRead, flammableOnLabel: false };
      const whole = `${"x".repeat(150)} FLAMMABLE-FREE LOTION`;
      const cloud = { ...lotion, labelText: Array.from(whole).slice(0, 160).join("") };
      const s = store();
      s.setDestination("CA");
      const id = s.addRead(outcome(lotion, "on_device"), "k");
      s.applySecondLook(id, mergeReads(lotion, cloud), 900, "reason", whole, readDisputes(lotion, cloud));
      expect(s.getState().items[0]?.labelTags).not.toContain("flammable");
      expect(s.getState().result.items[id]?.level).not.toBe("take_out");
    });

    it("settles battery numbers only on a whole set, never on one edited number", () => {
      const device = { ...powerBank, volts: 3.7, milliampHours: 2500, wattHours: 0 };
      const cloud = { ...powerBank, volts: 3.8, milliampHours: 2500, wattHours: 9.5 };
      const { s, id } = look(device, cloud);
      s.override(id, { milliampHours: 2600 });
      expect(s.getState().items[0]?.disputes?.battery?.resolved).toBe(false);
      expect(s.getState().result.items[id]?.hits.map((h) => h.ruleId)).toContain("DATA-DISPUTE");
      s.override(id, { volts: 3.7, milliampHours: 2600, wattHours: 9.62 });
      expect(s.getState().items[0]?.disputes?.battery?.resolved).toBe(true);
      // A single number corrected while the cloud read ran does not cancel the battery dispute either.
      const early = store();
      const eid = early.addRead(outcome(device, "on_device"), "k");
      early.override(eid, { milliampHours: 2500 });
      early.applySecondLook(eid, mergeReads(device, cloud), 900, "reason", cloud.labelText, readDisputes(device, cloud));
      expect(early.getState().items[0]?.disputes?.battery?.resolved).toBe(false);
    });

    it("settles a dispute when the sender fixes that fact, and keeps the disputes in the saved copy", async () => {
      const p = spyPersistence();
      const phone = { ...powerBank, itemName: "Phone", category: "phone" as const };
      const { s, id } = look(powerBank, phone, true, p);
      await s.settled();
      expect(p.saved()!.items?.[0]?.disputes?.category?.resolved).toBe(false);
      s.override(id, { category: "power_bank" });
      expect(s.getState().items[0]?.disputes?.category?.resolved).toBe(true);
      expect(s.getState().result.items[id]?.hits.map((h) => h.ruleId)).not.toContain("DATA-DISPUTE");
      await s.settled();
      expect(p.saved()!.items?.[0]?.disputes?.category?.resolved).toBe(true);
    });
  });

  it("removes an item, records errors and customs, and starts in the Philippines with consent unanswered", () => {
    const s = store();
    expect(s.getState().destinationCode).toBe("PH");
    expect(s.getState().cloudConsent).toBeNull();
    const id = s.addManual(shirtRead);
    s.setError(id, "Could not read this one");
    s.setCustoms(id, { description: "Men's cotton shirt", weightOz: 6 });
    expect(s.getState().errors[id]).toBe("Could not read this one");
    expect(s.getState().items[0]?.customs).toMatchObject({ description: "Men's cotton shirt", weightOz: 6, valueUsd: null });
    s.remove(id);
    expect(s.getState().items).toHaveLength(0);
    expect(s.getState().result.items[id]).toBeUndefined();
  });

  it("gives the edition its verdicts come from, for its limits and reviewed countries", () => expect(store().edition()).toBe(ed));

  it("adds a sample's recorded read under its own source, and counts it as no read made on this laptop", async () => {
    let k = 0;
    const s = createBoxStore({ edition: () => ed, persistence: spyPersistence(), now: () => 1000, today: () => "2026-11-20", newId: () => `r-${k++}` });
    await s.ready;
    const id = s.addRecorded(liquidLotionRead, 3997, "sample-key");
    const item = s.getState().items.find((i) => i.itemId === id)!;
    expect(item).toMatchObject({ readSource: "sample_recorded", readMs: 3997, cropKey: "sample-key", identityConfirmedBy: null });
    expect(s.getState().result.items[id]).toBeDefined();
    expect(s.getState().sources).toMatchObject({ onDevice: 0, inCloud: 0 });
  });

  describe("a page left open across a change to what the server accepts", () => {
    const refused = () => Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });

    it("says the page is out of date when the server refuses a save to a box this visit could open", async () => {
      const p = spyPersistence();
      p.putMeta.mockRejectedValue(refused());
      const s = store({ persistence: p });
      await s.ready;
      s.addManual({ ...liquidLotionLabelRead, itemName: "Lotion" });
      await s.settled();
      expect(s.getState().outOfDate).toBe(true);
    });

    it("does not call a page out of date when a save fails for another reason, such as no connection", async () => {
      const p = spyPersistence();
      p.putMeta.mockRejectedValue(new Error("offline"));
      const s = store({ persistence: p });
      await s.ready;
      s.addManual({ ...liquidLotionLabelRead, itemName: "Lotion" });
      await s.settled();
      expect(s.getState().outOfDate ?? false).toBe(false);
    });

    it("leaves a box this visit could not open to its own notice, since a reload would not fix it", async () => {
      const p = spyPersistence();
      p.loadBox.mockResolvedValue({ status: "failed", error: "not a member" });
      p.putMeta.mockRejectedValue(refused());
      const s = store({ persistence: p });
      await s.ready;
      s.addManual({ ...liquidLotionLabelRead, itemName: "Lotion" });
      await s.settled();
      expect(s.getState().loadState).toBe("failed");
      expect(s.getState().outOfDate ?? false).toBe(false);
    });
  });
});

