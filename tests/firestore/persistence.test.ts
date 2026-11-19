// Firestore persistence against the local emulator and the real rules: npm run test:rules.
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { BoxItem, BoxState } from "../../src/data/boxStore";
import { firestorePersistence, revisionOf } from "../../src/data/persistence";
import { createBoxStore } from "../../src/data/boxStore";
import { ed } from "../engine/helpers";

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-before-you-tape", firestore: { rules: readFileSync("firestore.rules", "utf8") } });
});
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const db = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const admin = async <T>(f: (d: Firestore) => Promise<T>) => {
  let out!: T;
  await env.withSecurityRulesDisabled(async (c) => { out = await f(c.firestore() as unknown as Firestore); });
  return out;
};

const item = (itemId: string, patch: Partial<BoxItem> = {}): BoxItem => ({
  itemId, quantity: 1, identityConfirmedBy: null, labelTags: ["cosmetic"], readSource: "on_device", readMs: 1200, secondLook: null, cropKey: `k-${itemId}`,
  read: {
    itemName: "Body lotion", category: "lotion_cream", labelText: "", volts: 0, milliampHours: 0, wattHours: 0, lithiumGrams: 0,
    batteryWords: false, liquid: true, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false, glassContainer: false,
    powder: false, retailBox: "cannot_tell", evidence: "label_read",
  },
  overrides: {}, answers: {},
  customs: { description: "", lintOk: false, weightOz: null, valueUsd: null, countryOfOrigin: null, upc: null },
  ...patch,
});
const state = (items: BoxItem[], patch: Partial<BoxState> = {}): BoxState => ({
  boxId: "b1", destinationCode: "CA", items, cloudConsent: true,
  sources: { onDevice: items.length, inCloud: 0, secondLooks: 0, rulesOnlyRechecks: 0, cloudFallbacks: 0 },
  lastRecheckMs: null, errors: {}, result: {} as BoxState["result"], ...patch,
});

describe("firestorePersistence", () => {
  it("creates the box with its owner as the only member, saves items, and loads them back", async () => {
    const p = firestorePersistence(db("alice"), "alice", "byt-test");
    expect(await p.load("b1")).toBeNull();
    p.save(state([item("i1"), item("i2", { quantity: 3 })]));
    await p.idle();
    const box = (await admin((d) => getDoc(doc(d, "boxes/b1")))).data();
    // A box holds no consent answer, whatever the saving tab holds: each device keeps its own.
    expect(box).toMatchObject({ ownerUid: "alice", memberUids: ["alice"], joinKeyHash: "", destinationCode: "CA", editionId: "byt-test" });
    expect(box && "cloudConsent" in box).toBe(false);
    const loaded = await firestorePersistence(db("alice"), "alice", "byt-test").load("b1");
    expect(loaded).toMatchObject({ boxId: "b1", destinationCode: "CA", sources: { onDevice: 2 } });
    expect(loaded && "cloudConsent" in loaded).toBe(false);
    expect(loaded?.items?.map((i) => [i.itemId, i.quantity]).sort()).toEqual([["i1", 1], ["i2", 3]]);
  });

  it("creates the box even when the first save comes before the load has answered, as the store does", async () => {
    const p = firestorePersistence(db("alice"), "alice", "byt-test");
    const loading = p.load("b1");
    p.save(state([item("i1")]));
    await loading;
    await p.idle();
    expect(p.lastError()).toBeNull();
    const box = (await admin((d) => getDoc(doc(d, "boxes/b1")))).data();
    expect(box).toMatchObject({ ownerUid: "alice", memberUids: ["alice"] });
    expect((await firestorePersistence(db("alice"), "alice", "byt-test").load("b1"))?.items?.map((i) => i.itemId)).toEqual(["i1"]);
  });

  it("creates the box when a save comes with no load at all", async () => {
    const p = firestorePersistence(db("alice"), "alice", "byt-test");
    p.save(state([item("i1")]));
    await p.idle();
    expect(p.lastError()).toBeNull();
    expect((await admin((d) => getDoc(doc(d, "boxes/b1")))).exists()).toBe(true);
  });

  it("never stores label text, and deletes items removed from the box", async () => {
    const p = firestorePersistence(db("alice"), "alice", "byt-test");
    await p.load("b1");
    p.save(state([item("i1"), item("i2")]));
    p.save(state([item("i2", { quantity: 2 })]));
    await p.idle();
    const items = await admin(async (d) => (await getDocs(collection(d, "boxes/b1/items"))).docs.map((x) => x.data() as BoxItem));
    expect(items.map((i) => [i.itemId, i.quantity])).toEqual([["i2", 2]]);
    expect(items.every((i) => i.read.labelText === "")).toBe(true);
  });

  it("keeps a second look's disputes in their own document, loads them back onto the item, and deletes them when gone", async () => {
    const path = (id: string) => `boxes/b1/disputes/${id}`;
    const disputesAt = (id: string) => admin(async (d) => (await getDoc(doc(d, path(id)))).data());
    const disputes: BoxItem["disputes"] = { category: { device: "power_bank", cloud: "phone", resolved: false } };
    const p = firestorePersistence(db("alice"), "alice", "byt-test");
    await p.load("b1");
    p.save(state([item("i1", { disputes }), item("i2")]));
    await p.idle();
    expect(p.lastError()).toBeNull();
    // The item document never carries them: the item's own rules stay as they are.
    expect(await admin(async (d) => (await getDoc(doc(d, "boxes/b1/items/i1"))).data())).not.toHaveProperty("disputes");
    // The disputes document records which version of the item it was written with.
    const savedDisputes = await disputesAt("i1") as Record<string, unknown>;
    const { itemRev, ...facts } = savedDisputes;
    expect(facts).toEqual(disputes);
    expect(itemRev).toBe(revisionOf(await admin(async (d) => (await getDoc(doc(d, "boxes/b1/items/i1"))).data())));
    expect(await disputesAt("i2")).toBeUndefined();
    // A fresh load puts them back on their item, and only there.
    const back = await firestorePersistence(db("alice"), "alice", "byt-test").load("b1");
    expect(back?.items?.find((i) => i.itemId === "i1")?.disputes).toEqual(disputes);
    expect(back?.items?.find((i) => i.itemId === "i2")).not.toHaveProperty("disputes");
    // An item that no longer has disputes, or is removed, leaves no disputes document behind.
    p.save(state([item("i1"), item("i2", { disputes })]));
    p.save(state([item("i1")]));
    await p.idle();
    expect(p.lastError()).toBeNull();
    expect(await disputesAt("i1")).toBeUndefined();
    expect(await disputesAt("i2")).toBeUndefined();
  });

  it("writes an item and its disputes in one batch: a refused dispute write saves neither, and says which item", async () => {
    const p = firestorePersistence(db("alice"), "alice", "byt-test");
    const unsaved: Array<ReadonlySet<string>> = [];
    p.onUnsaved?.((ids) => unsaved.push(ids));
    await p.load("b1");
    p.save(state([item("i1", { quantity: 1 })]));
    await p.idle();
    // A dispute the rules refuse (a category no read has): the item's own change must not land either.
    const bad = { category: { device: "spaceship", cloud: "phone", resolved: false } } as unknown as BoxItem["disputes"];
    p.save(state([item("i1", { quantity: 3, disputes: bad, secondLook: { ms: 900, reason: "r" } })]));
    await p.idle();
    expect(p.lastError()).not.toBeNull();
    expect((await admin(async (d) => (await getDoc(doc(d, "boxes/b1/items/i1"))).data()))?.quantity).toBe(1);
    expect(unsaved.at(-1)).toEqual(new Set(["i1"]));
    // The next good save clears it.
    p.save(state([item("i1", { quantity: 3 })]));
    await p.idle();
    expect(unsaved.at(-1)).toEqual(new Set());
  });

  it("holds an item at Check this when it changed after its disputes were saved", async () => {
    const disputes: BoxItem["disputes"] = { category: { device: "power_bank", cloud: "phone", resolved: true } };
    const p = firestorePersistence(db("alice"), "alice", "byt-test");
    await p.load("b1");
    p.save(state([item("i1", { disputes, secondLook: { ms: 900, reason: "r" } }), item("i2", { disputes, secondLook: { ms: 900, reason: "r" } })]));
    await p.idle();
    // Another writer changes one item without its disputes (an older app, a phone, a hand edit).
    await admin(async (d) => { await updateDoc(doc(d, "boxes/b1/items/i1"), { quantity: 4 }); });
    const back = await firestorePersistence(db("alice"), "alice", "byt-test").load("b1");
    // The changed item's settled disputes come back open; the untouched one comes back as saved.
    expect(back?.items?.find((i) => i.itemId === "i1")?.disputes?.category?.resolved).toBe(false);
    expect(back?.items?.find((i) => i.itemId === "i2")?.disputes).toEqual(disputes);
  });

  describe("explicit operations", () => {
    const meta = { destinationCode: "PH", sources: { onDevice: 1, inCloud: 0, secondLooks: 0, rulesOnlyRechecks: 0, cloudFallbacks: 0 }, lastRecheckMs: null };

    it("tells a missing box from a found one and from a read that failed", async () => {
      const p = firestorePersistence(db("alice"), "alice", "byt-test");
      expect(await p.loadBox("b1")).toEqual({ status: "missing" });
      await p.putMeta("b1", meta);
      await p.putItem("b1", item("i1"));
      const found = await p.loadBox("b1");
      expect(found.status).toBe("found");
      expect(found.status === "found" && found.box.destinationCode).toBe("PH");
      expect(found.status === "found" && found.box.items?.map((i) => i.itemId)).toEqual(["i1"]);
      // Another user's box: the read is refused, which is a failure, never an empty box.
      const other = await firestorePersistence(db("bob"), "bob", "byt-test").loadBox("b1");
      expect(other.status).toBe("failed");
    });

    it("creates the box with its owner only, then changes only what each operation names", async () => {
      const p = firestorePersistence(db("alice"), "alice", "byt-test");
      await p.putMeta("b1", meta);
      await p.putItem("b1", item("i1"));
      await p.putItem("b1", item("i2"));
      const box = await admin(async (d) => (await getDoc(doc(d, "boxes/b1"))).data());
      expect(box).toMatchObject({ ownerUid: "alice", memberUids: ["alice"], destinationCode: "PH", editionId: "byt-test" });
      // A meta change touches only the box document; an item change only that item.
      await p.putMeta("b1", { ...meta, destinationCode: "CA" });
      await p.putItem("b1", item("i2", { quantity: 3 }));
      const items = await admin(async (d) => (await getDocs(collection(d, "boxes/b1/items"))).docs.map((x) => x.data() as BoxItem));
      expect(items.map((i) => [i.itemId, i.quantity])).toEqual([["i1", 1], ["i2", 3]]);
      expect((await admin(async (d) => (await getDoc(doc(d, "boxes/b1"))).data()))?.destinationCode).toBe("CA");
    });

    it("writes an item with its disputes, clears them with the item, and deletes both together", async () => {
      const disputes: BoxItem["disputes"] = { category: { device: "power_bank", cloud: "phone", resolved: false } };
      const p = firestorePersistence(db("alice"), "alice", "byt-test");
      await p.putMeta("b1", meta);
      await p.putItem("b1", item("i1", { disputes, secondLook: { ms: 900, reason: "r" } }));
      const at = (path: string) => admin(async (d) => (await getDoc(doc(d, path))).data());
      expect(await at("boxes/b1/disputes/i1")).toMatchObject(disputes!);
      await p.putItem("b1", item("i1", { secondLook: { ms: 900, reason: "r" } }));
      expect(await at("boxes/b1/disputes/i1")).toBeUndefined();
      await p.putItem("b1", item("i1", { disputes, secondLook: { ms: 900, reason: "r" } }));
      await p.deleteItem("b1", "i1");
      expect(await at("boxes/b1/items/i1")).toBeUndefined();
      expect(await at("boxes/b1/disputes/i1")).toBeUndefined();
    });
  });

  it("keeps saving after another member joins, and never sends membership again", async () => {
    const p = firestorePersistence(db("alice"), "alice", "byt-test");
    await p.load("b1");
    p.save(state([item("i1")]));
    await p.idle();
    await admin((d) => updateDoc(doc(d, "boxes/b1"), { memberUids: ["alice", "phone"], joinKeyHash: "h" }));
    p.save(state([item("i1")], { destinationCode: "PH" }));
    await p.idle();
    expect(p.lastError()).toBeNull();
    const box = (await admin((d) => getDoc(doc(d, "boxes/b1")))).data();
    expect(box).toMatchObject({ memberUids: ["alice", "phone"], joinKeyHash: "h", destinationCode: "PH" });
  });

  it("reports a refused write instead of throwing, and loads nothing from a box it is not a member of", async () => {
    await firestorePersistence(db("alice"), "alice", "byt-test").load("b1");
    const a = firestorePersistence(db("alice"), "alice", "byt-test");
    await a.load("b1");
    a.save(state([item("i1")]));
    await a.idle();
    const bob = firestorePersistence(db("bob"), "bob", "byt-test");
    expect(await bob.load("b1")).toBeNull();
    bob.save(state([item("i9")]));
    await bob.idle();
    expect(bob.lastError()).toMatch(/permission/i);
  });

  it("keeps an item's own names out of Firestore: the model's words and the sender's correction", async () => {
    const p = firestorePersistence(db("alice"), "alice", "byt-test");
    const store = createBoxStore({ edition: () => ed, persistence: p, now: () => 0, today: () => "2026-11-20", newId: () => "item-1", boxId: "b2" });
    await store.ready;
    store.addRead({ read: { ...item("x").read, itemName: "SECRET LABEL WORDS LOTION", category: "lotion_cream" }, source: "on_device", ms: 1, route: "device_only", recoveredFrom: null }, "k");
    await p.idle();
    const items = (await admin((d) => getDocs(collection(d, "boxes/b2/items")))).docs.map((d) => d.data());
    expect(items).toHaveLength(1);
    expect(JSON.stringify(items)).not.toContain("SECRET");
    expect(items[0]?.read?.itemName).toBe("Lotion or cream");
    store.setConsent(true);
    store.override("item-1", { itemName: "GRANDMA ROSE WATER" });
    await p.idle();
    const after = (await admin((d) => getDocs(collection(d, "boxes/b2/items")))).docs.map((d) => d.data());
    expect(JSON.stringify(after)).not.toMatch(/SECRET|GRANDMA/);
  });

  it("deletes the consent an older version saved on a box, and two tabs that both found no box never overwrite it", async () => {
    await admin((d) => setDoc(doc(d, "boxes/b4"), { ownerUid: "alice", memberUids: ["alice"], joinKeyHash: "", destinationCode: "CA", editionId: "old", cloudConsent: true }));
    const old = firestorePersistence(db("alice"), "alice", "byt-test");
    await old.load("b4");
    old.save(state([], { boxId: "b4" }));
    await old.idle();
    expect(old.lastError()).toBeNull();
    expect("cloudConsent" in ((await admin((d) => getDoc(doc(d, "boxes/b4")))).data() ?? {})).toBe(false);
    // Two tabs, both of which found no box: one creates it, the other's first save merges into it.
    const a = firestorePersistence(db("alice"), "alice", "byt-test");
    const b = firestorePersistence(db("alice"), "alice", "byt-test");
    await Promise.all([a.load("b5"), b.load("b5")]);
    a.save(state([item("first")], { boxId: "b5", destinationCode: "PH" }));
    await a.idle();
    b.save(state([item("late")], { boxId: "b5" }));
    await b.idle();
    expect(b.lastError()).toBeNull();
    expect((await admin((d) => getDoc(doc(d, "boxes/b5")))).data()).toMatchObject({ ownerUid: "alice", memberUids: ["alice"] });
    expect((await admin((d) => getDoc(doc(d, "boxes/b5/items/late")))).exists()).toBe(true);
  });
});
