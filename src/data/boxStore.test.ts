import { describe, expect, it, vi } from "vitest";
import type { ReadOutcome } from "../ai/itemRead";
import type { InferenceSourceName } from "../ai/port";
import type { ItemRead } from "../shared/itemRead";
import { ed } from "../../tests/engine/helpers";
import { createBoxStore, type BoxItem, type BoxPersistence, type BoxState, type ConsentChannel, type ConsentMessage } from "./boxStore";

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
const spyPersistence = (loaded: Partial<BoxState> | null = null) =>
  ({ save: vi.fn<(s: BoxState) => void>(), load: vi.fn(async () => loaded) }) satisfies BoxPersistence;
let ids = 0;
const store = (o: { persistence?: BoxPersistence } = {}) => createBoxStore({
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
    const id = s.addManual(liquidLotionRead);
    expect(s.getState().result.items[id]?.headline).toBe("OK to pack");
    s.setDestination("PH");
    expect(s.getState().result.items[id]?.headline).toBe("Take it out");
    expect(s.getState().sources.rulesOnlyRechecks).toBe(1);
  });

  it("keeps the re-check time only until the box changes, so it never describes a later read", () => {
    const s = store();
    s.addManual(liquidLotionRead);
    s.setDestination("PH");
    expect(s.getState().lastRecheckMs).not.toBeNull();
    s.addRead(outcome(shirtRead, "in_cloud"), "crop-1");
    expect(s.getState().lastRecheckMs).toBeNull();
    s.setDestination("CA");
    s.addManual(shirtRead);
    expect(s.getState().lastRecheckMs).toBeNull();
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

  it("hands persistence an item with no label text and with its label tags", () => {
    const p = spyPersistence();
    const s = store({ persistence: p });
    s.addRead(outcome(perfumeLabelRead, "on_device"), "k");
    const saved = p.save.mock.calls.at(-1)![0].items[0]!;
    expect(saved.read.labelText).toBe("");
    expect(saved.labelTags).toContain("alcohol");
    expect(s.getState().items[0]?.read.labelText).toBe(perfumeLabelRead.labelText);
  });

  it("keeps a corrected label's tags when the corrected text itself is not saved", () => {
    const p = spyPersistence();
    const s = store({ persistence: p });
    const id = s.addRead(outcome({ ...base, category: "lotion_cream", labelText: "BODY LOTION" }, "on_device"), "k");
    s.override(id, { labelText: "BODY LOTION ALCOHOL DENAT 8 FL OZ" });
    const saved = p.save.mock.calls.at(-1)![0].items[0]!;
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
    expect(s.getState().cloudConsent).toBe(true);
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
    const newer = { ...ed, editionId: "byt-newer000001", destinations: { ...ed.destinations, CA: { ...ed.destinations.CA!, checkedOn: "2026-11-25" } } };
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

  it("lets a consent choice made before the saved box arrives win over the saved one, even when it reopens the question", async () => {
    const late = () => {
      let arrive!: (saved: Partial<BoxState>) => void;
      const persistence: BoxPersistence = { save: () => {}, load: () => new Promise((r) => { arrive = r; }) };
      return { s: store({ persistence }), arrive: (saved: Partial<BoxState>) => arrive(saved) };
    };
    // The sender chose "Keep everything on this laptop", then "Turn on cloud checks", which asks again.
    const asked = late();
    asked.s.setConsent(false);
    asked.s.setConsent(null);
    asked.arrive({ cloudConsent: true });
    await asked.s.ready;
    expect(asked.s.getState().cloudConsent).toBeNull();
    // With no choice made yet, the saved answer applies.
    const untouched = late();
    untouched.arrive({ cloudConsent: true });
    await untouched.s.ready;
    expect(untouched.s.getState().cloudConsent).toBe(true);
  });

  it("shares a consent change with the other tabs on the same box, and only the tab that chose saves it", async () => {
    // Every tab's channel reaches every other tab's, as BroadcastChannel does; never its own.
    const tabs = new Set<Set<(m: ConsentMessage) => void>>();
    const channel = (): ConsentChannel => {
      const mine = new Set<(m: ConsentMessage) => void>();
      tabs.add(mine);
      return {
        post: (m) => { for (const t of tabs) if (t !== mine) for (const f of t) f(m); },
        listen: (f) => { mine.add(f); return () => { mine.delete(f); }; },
      };
    };
    // One server answer for the box, as Firestore holds it.
    const server = { consent: null as boolean | null };
    const saving = () => ({
      ...spyPersistence(),
      saveConsent: vi.fn<(boxId: string, v: boolean | null, chosenAt: number) => void>((_b, v) => { server.consent = v; }),
      readConsent: vi.fn(async (): Promise<boolean | null | undefined> => server.consent),
    });
    const make = (boxId: string, persistence: BoxPersistence) =>
      createBoxStore({ edition: () => ed, persistence, now: () => 1000, today: () => "2026-11-20", newId: () => `id-${ids++}`, boxId, consentChannel: channel() });
    const pa = saving();
    const pb = saving();
    const a = make("shared", pa);
    const b = make("shared", pb);
    const elsewhere = make("another-box", saving());
    const seenByB = vi.fn();
    b.subscribe(seenByB);
    const savesByB = pb.save.mock.calls.length;
    // A grant is not taken from the message: B asks the server, and takes it once the server says allowed.
    a.setConsent(true);
    expect(b.getState().cloudConsent).toBeNull();
    await vi.waitFor(() => expect(b.getState().cloudConsent).toBe(true));
    // A withdrawal holds at once.
    a.setConsent(false);
    expect(b.getState().cloudConsent).toBe(false);
    expect(seenByB).toHaveBeenLastCalledWith(expect.objectContaining({ cloudConsent: false }));
    // Neither message makes B save its box, which could carry its older items.
    expect(pb.save.mock.calls.length).toBe(savesByB);
    expect(elsewhere.getState().cloudConsent).toBeNull();
    expect(pa.saveConsent.mock.calls).toEqual([["shared", true, expect.any(Number)], ["shared", false, expect.any(Number)]]);
    expect(pb.saveConsent).not.toHaveBeenCalled();
    // A saved answer that loads after another tab's choice does not undo it.
    const late = (() => { let arrive!: (s: Partial<BoxState>) => void; const persistence = { save: () => {}, load: () => new Promise<Partial<BoxState> | null>((r) => { arrive = r; }) }; return { s: make("shared", persistence), arrive: (s: Partial<BoxState>) => arrive(s) }; })();
    a.setConsent(false);
    late.arrive({ cloudConsent: true });
    await late.s.ready;
    expect(late.s.getState().cloudConsent).toBe(false);
  });

  it("saves the model's own name for an item only after cloud consent; before, a category name, with the real one kept on this device", async () => {
    const lotion: ItemRead = { ...liquidLotionLabelRead, itemName: "SHEA BUTTER BODY LOTION FROM ACME" };
    const remembered: Record<string, Record<string, string>> = {};
    const deviceNames = { remember: (boxId: string, names: Record<string, string>) => { remembered[boxId] = { ...names }; }, recall: (boxId: string) => remembered[boxId] ?? {} };
    const persistence = spyPersistence();
    const s = createBoxStore({ edition: () => ed, persistence, now: () => 1000, today: () => "2026-11-20", newId: () => `id-${ids++}`, boxId: "names-box", deviceNames });
    const read = s.addRead(outcome(lotion, "on_device"), "k");
    const typed = s.addManual({ ...lotion, itemName: "My aunt's lotion" });
    const saved = () => persistence.save.mock.calls.at(-1)?.[0].items ?? [];
    expect(saved().find((i) => i.itemId === read)?.read.itemName).toBe("Lotion or cream");
    expect(saved().find((i) => i.itemId === typed)?.read.itemName).toBe("My aunt's lotion");
    expect(JSON.stringify(saved())).not.toContain("ACME");
    expect(s.getState().items.find((i) => i.itemId === read)?.read.itemName).toBe(lotion.itemName);
    expect(remembered["names-box"]?.[read]).toBe(lotion.itemName);
    // A reload on this device gets the real name back from the device, not from the server.
    const back = createBoxStore({ edition: () => ed, persistence: spyPersistence({ items: saved() }), now: () => 1000, today: () => "2026-11-20", newId: () => `id-${ids++}`, boxId: "names-box", deviceNames });
    await back.ready;
    expect(back.getState().items.find((i) => i.itemId === read)?.read.itemName).toBe(lotion.itemName);
    // After consent the model's name is saved.
    s.setConsent(true);
    expect(saved().find((i) => i.itemId === read)?.read.itemName).toBe(lotion.itemName);
  });

  it("opens the cloud only on the server's answer, and says no when there is no server to ask", async () => {
    const answer = (v: boolean | null | undefined) => createBoxStore({
      edition: () => ed, persistence: { ...spyPersistence(), readConsent: async () => v }, now: () => 1000, today: () => "2026-11-20", newId: () => `id-${ids++}`,
    });
    const yes = answer(true);
    expect(await yes.confirmConsent()).toBe(true);
    for (const v of [false, null, undefined]) {
      const s = answer(v);
      s.setConsent(true);
      expect(await s.confirmConsent()).toBe(false);
    }
    const noServer = store();
    noServer.setConsent(true);
    expect(await noServer.confirmConsent()).toBe(false);
  });

  it("ignores a grant from another tab that the server does not back", async () => {
    let deliver!: (m: ConsentMessage) => void;
    const s = createBoxStore({
      edition: () => ed, persistence: { ...spyPersistence(), readConsent: async () => false }, now: () => 1000, today: () => "2026-11-20",
      newId: () => `id-${ids++}`, boxId: "x", consentChannel: { post: () => {}, listen: (f) => { deliver = f; return () => {}; } },
    });
    deliver({ boxId: "x", consent: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(s.getState().cloudConsent).toBeNull();
  });

  it("removes an item, records errors and customs, and starts in Canada with consent unanswered", () => {
    const s = store();
    expect(s.getState().destinationCode).toBe("CA");
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
});
