// Firestore persistence against the local emulator and the real rules: npm run test:rules.
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteField, disableNetwork, doc, enableNetwork, getDoc, getDocs, collection, setDoc, Timestamp, updateDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { BoxItem } from "../../src/data/boxStore";
import type { BoxMeta } from "../../src/data/boxOps";
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

const DAY = 86_400_000;
// A stored document without its expiry, which the app keeps out of the items it holds.
const unexpired = (d: unknown) => { const { expiresAt: _e, ...rest } = (d ?? {}) as Record<string, unknown>; void _e; return rest; };

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

describe("firestorePersistence", () => {
  const meta = (patch: Partial<BoxMeta> = {}): BoxMeta => ({ destinationCode: "CA", sources: { onDevice: 2, inCloud: 0, secondLooks: 0, rulesOnlyRechecks: 0, cloudFallbacks: 0 }, lastRecheckMs: null, ...patch });
  const at = (path: string) => admin(async (d) => (await getDoc(doc(d, path))).data());

  it("creates the box with its owner as the only member, saves items, and loads them back with no consent", async () => {
    const p = firestorePersistence(db("alice"), "alice", "byt-test");
    await p.putMeta("b1", meta());
    await p.putItem("b1", item("i1"));
    await p.putItem("b1", item("i2", { quantity: 3 }));
    const box = await at("boxes/b1");
    // A box holds no consent answer: each device keeps its own.
    expect(box).toMatchObject({ ownerUid: "alice", memberUids: ["alice"], joinKeyHash: "", destinationCode: "CA", editionId: "byt-test" });
    expect(box && "cloudConsent" in box).toBe(false);
    const loaded = await firestorePersistence(db("alice"), "alice", "byt-test").loadBox("b1");
    expect(loaded.status === "found" && loaded.box).toMatchObject({ boxId: "b1", destinationCode: "CA", sources: { onDevice: 2 } });
    expect(loaded.status === "found" && loaded.box.items?.map((i) => [i.itemId, i.quantity]).sort()).toEqual([["i1", 1], ["i2", 3]]);
  });

  it("gives a new box an expiry 37 days out and its items and disputes the same, and keeps the expiry out of loaded items", async () => {
    const before = Date.now();
    const p = firestorePersistence(db("alice"), "alice", "byt-test");
    await p.putMeta("b1", meta());
    await p.putItem("b1", item("i1", { disputes: { liquid: { device: true, cloud: false, resolved: false } } }));
    const expiresAt = (await at("boxes/b1"))!.expiresAt as Timestamp;
    expect(expiresAt.toMillis()).toBeGreaterThanOrEqual(before + 37 * DAY);
    expect(expiresAt.toMillis()).toBeLessThanOrEqual(Date.now() + 37 * DAY);
    expect((await at("boxes/b1/items/i1"))!.expiresAt).toEqual(expiresAt);
    expect((await at("boxes/b1/disputes/i1"))!.expiresAt).toEqual(expiresAt);
    // A session that only loaded the box, and one that never read it, write the same expiry.
    const loadedFirst = firestorePersistence(db("alice"), "alice", "byt-test");
    const back = await loadedFirst.loadBox("b1");
    await loadedFirst.putItem("b1", item("i2"));
    await firestorePersistence(db("alice"), "alice", "byt-test").putItem("b1", item("i3"));
    for (const id of ["i2", "i3"]) expect((await at(`boxes/b1/items/${id}`))!.expiresAt).toEqual(expiresAt);
    // The items the app holds carry no expiry.
    expect(back.status === "found" && back.box.items?.some((i) => "expiresAt" in i)).toBe(false);
    // An update leaves the box's expiry as it was.
    await p.putMeta("b1", meta({ destinationCode: "PH" }));
    expect((await at("boxes/b1"))!.expiresAt).toEqual(expiresAt);
  });

  it("deletes a box for good: its items and disputes, then the box with a tombstone, so its id never starts again", async () => {
    const p = firestorePersistence(db("alice"), "alice", "byt-test");
    await p.putMeta("b1", meta());
    await p.putItem("b1", item("i1", { disputes: { liquid: { device: true, cloud: false, resolved: false } } }));
    await p.putItem("b1", item("i2"));
    const expiresAt = (await at("boxes/b1"))!.expiresAt;
    await p.deleteBox!("b1");
    expect(await at("boxes/b1")).toBeUndefined();
    for (const sub of ["items", "disputes"]) expect((await admin((d) => getDocs(collection(d, `boxes/b1/${sub}`)))).size).toBe(0);
    // The tombstone outlives the box by 30 days, so TTL removes anything left behind first.
    expect(await at("retiredBoxes/b1")).toEqual({ expiresAt: Timestamp.fromMillis((expiresAt as Timestamp).toMillis() + 30 * 86_400_000) });
    // The id is retired: no one can start a box there again.
    await expect(firestorePersistence(db("alice"), "alice", "byt-test").putMeta("b1", meta())).rejects.toThrow();
    // Deleting a box that is already gone does nothing.
    await expect(p.deleteBox!("b1")).resolves.toBeUndefined();
  });

  it("refuses a box with no expiry before touching any of its items, since its tombstone could not be written", async () => {
    const p = firestorePersistence(db("alice"), "alice", "byt-test");
    await p.putMeta("b7", meta());
    await p.putItem("b7", item("i1"));
    await admin((d) => updateDoc(doc(d, "boxes/b7"), { expiresAt: deleteField() }));
    await expect(p.deleteBox("b7")).rejects.toThrow("no expiry");
    expect(await at("boxes/b7/items/i1")).toBeDefined();
  });

  it("retires the id of a box not in Firestore yet, so a first save still on its way cannot create it", async () => {
    const p = firestorePersistence(db("alice"), "alice", "byt-test");
    await p.deleteBox("b8");
    // 67 days out (the box's 37 plus 30), by this clock, which the rules check against the server's.
    const expiresAt = (await at("retiredBoxes/b8"))!.expiresAt as Timestamp;
    expect(Math.abs(expiresAt.toMillis() - (Date.now() + 67 * DAY))).toBeLessThan(60_000);
    await expect(p.putMeta("b8", meta())).rejects.toThrow();
    // Retired already: deleting it again does nothing.
    await expect(p.deleteBox("b8")).resolves.toBeUndefined();
  });

  it("retires an id with no box on a device clock two days slow, and fails, retiring nothing, on one far off", async () => {
    await firestorePersistence(db("alice"), "alice", "byt-test", () => Date.now() - 2 * DAY).deleteBox("b5");
    expect(await at("retiredBoxes/b5")).toBeDefined();
    await expect(firestorePersistence(db("alice"), "alice", "byt-test", () => Date.now() - 10 * DAY).deleteBox("b6")).rejects.toThrow();
    expect(await at("retiredBoxes/b6")).toBeUndefined();
  });

  it("deletes only from what the server holds: offline, it fails at once and deletes nothing", async () => {
    const alice = db("alice");
    const p = firestorePersistence(alice, "alice", "byt-test");
    await p.putMeta("b3", meta());
    await p.putItem("b3", item("i1"));
    await p.loadBox("b3");
    await disableNetwork(alice);
    const outcome = await Promise.race([
      p.deleteBox("b3").then(() => "deleted", () => "refused"),
      new Promise<string>((r) => setTimeout(() => r("still waiting"), 3000)),
    ]);
    await enableNetwork(alice);
    expect(outcome).toBe("refused");
    expect(await at("boxes/b3")).toBeDefined();
    expect(await at("boxes/b3/items/i1")).toBeDefined();
  });

  it("never lets anyone but the owner delete a box, nor any of its items on the way", async () => {
    await firestorePersistence(db("alice"), "alice", "byt-test").putMeta("b2", meta());
    await firestorePersistence(db("alice"), "alice", "byt-test").putItem("b2", item("i1"));
    // A second member (only an admin can add one): the delete stops before touching anything.
    await admin((d) => updateDoc(doc(d, "boxes/b2"), { memberUids: ["alice", "bob"] }));
    await expect(firestorePersistence(db("bob"), "bob", "byt-test").deleteBox!("b2")).rejects.toThrow();
    expect(await at("boxes/b2")).toBeDefined();
    expect(await at("boxes/b2/items/i1")).toBeDefined();
  });

  it("keeps a box from before expiry working, and its disputes paired once the backfill gives it an expiry", async () => {
    await admin((d) => setDoc(doc(d, "boxes/old"), { ownerUid: "alice", memberUids: ["alice"], joinKeyHash: "", destinationCode: "CA", editionId: "byt-test" }));
    const p = firestorePersistence(db("alice"), "alice", "byt-test");
    const disputes: BoxItem["disputes"] = { category: { device: "power_bank", cloud: "phone", resolved: false } };
    await p.putItem("old", item("i1", { disputes }));
    expect(await at("boxes/old/items/i1")).not.toHaveProperty("expiresAt");
    const later = Timestamp.fromMillis(Date.now() + 37 * DAY);
    await admin(async (d) => {
      for (const path of ["boxes/old", "boxes/old/items/i1", "boxes/old/disputes/i1"]) await updateDoc(doc(d, path), { expiresAt: later });
    });
    const back = await firestorePersistence(db("alice"), "alice", "byt-test").loadBox("old");
    expect(back.status === "found" && back.box.items?.[0]?.disputes).toEqual(disputes);
  });

  it("keeps a second look's disputes in their own document with the item's revision, and loads them back onto it", async () => {
    const disputes: BoxItem["disputes"] = { category: { device: "power_bank", cloud: "phone", resolved: false } };
    const p = firestorePersistence(db("alice"), "alice", "byt-test");
    await p.putMeta("b1", meta());
    await p.putItem("b1", item("i1", { disputes }));
    await p.putItem("b1", item("i2"));
    // The item document never carries them: the item's own rules stay as they are.
    expect(await at("boxes/b1/items/i1")).not.toHaveProperty("disputes");
    const { itemRev, ...facts } = unexpired(await at("boxes/b1/disputes/i1"));
    expect(facts).toEqual(disputes);
    // The revision is of the item as the app holds it, without its expiry, so a backfilled expiry changes nothing.
    expect(itemRev).toBe(revisionOf(unexpired(await at("boxes/b1/items/i1"))));
    expect(await at("boxes/b1/disputes/i2")).toBeUndefined();
    const back = await firestorePersistence(db("alice"), "alice", "byt-test").loadBox("b1");
    expect(back.status === "found" && back.box.items?.find((i) => i.itemId === "i1")?.disputes).toEqual(disputes);
    expect(back.status === "found" && back.box.items?.find((i) => i.itemId === "i2")).not.toHaveProperty("disputes");
  });

  it("writes an item and its disputes in one batch: a refused dispute write saves neither", async () => {
    const p = firestorePersistence(db("alice"), "alice", "byt-test");
    await p.putMeta("b1", meta());
    await p.putItem("b1", item("i1", { quantity: 1 }));
    // A dispute the rules refuse (a category no read has): the item's own change must not land either.
    const bad = { category: { device: "spaceship", cloud: "phone", resolved: false } } as unknown as BoxItem["disputes"];
    await expect(p.putItem("b1", item("i1", { quantity: 3, disputes: bad, secondLook: { ms: 900, reason: "r" } }))).rejects.toThrow();
    expect((await at("boxes/b1/items/i1"))?.quantity).toBe(1);
  });

  it("holds an item at Check this when it changed after its disputes were saved", async () => {
    const disputes: BoxItem["disputes"] = { category: { device: "power_bank", cloud: "phone", resolved: true } };
    const p = firestorePersistence(db("alice"), "alice", "byt-test");
    await p.putMeta("b1", meta());
    await p.putItem("b1", item("i1", { disputes, secondLook: { ms: 900, reason: "r" } }));
    await p.putItem("b1", item("i2", { disputes, secondLook: { ms: 900, reason: "r" } }));
    // Another writer changes one item without its disputes (an older app, a phone, a hand edit).
    await admin(async (d) => { await updateDoc(doc(d, "boxes/b1/items/i1"), { quantity: 4 }); });
    const back = await firestorePersistence(db("alice"), "alice", "byt-test").loadBox("b1");
    const byId = (id: string) => (back.status === "found" ? back.box.items?.find((i) => i.itemId === id) : undefined);
    expect(byId("i1")?.disputes?.category?.resolved).toBe(false);
    expect(byId("i2")?.disputes).toEqual(disputes);
  });

  it("keeps saving after another member joins, and never sends membership again", async () => {
    const p = firestorePersistence(db("alice"), "alice", "byt-test");
    await p.putMeta("b1", meta());
    await admin((d) => updateDoc(doc(d, "boxes/b1"), { memberUids: ["alice", "phone"], joinKeyHash: "h" }));
    await p.putMeta("b1", meta({ destinationCode: "PH" }));
    expect(await at("boxes/b1")).toMatchObject({ memberUids: ["alice", "phone"], joinKeyHash: "h", destinationCode: "PH" });
  });

  it("refuses another user's writes, and reads their box as a failed read", async () => {
    await firestorePersistence(db("alice"), "alice", "byt-test").putMeta("b1", meta());
    const bob = firestorePersistence(db("bob"), "bob", "byt-test");
    expect((await bob.loadBox("b1")).status).toBe("failed");
    await expect(bob.putItem("b1", item("i9"))).rejects.toThrow(/permission/i);
    await expect(bob.putMeta("b1", meta())).rejects.toThrow(/permission/i);
  });

  it("keeps an item's own names out of Firestore: the model's words and the sender's correction", async () => {
    const p = firestorePersistence(db("alice"), "alice", "byt-test");
    const store = createBoxStore({ edition: () => ed, persistence: p, now: () => 0, today: () => "2026-11-20", newId: () => "item-1", boxId: "b2" });
    await store.ready;
    store.addRead({ read: { ...item("x").read, itemName: "SECRET LABEL WORDS LOTION", category: "lotion_cream" }, source: "on_device", ms: 1, route: "device_only", recoveredFrom: null }, "k");
    await store.settled();
    const items = (await admin((d) => getDocs(collection(d, "boxes/b2/items")))).docs.map((d) => d.data());
    expect(items).toHaveLength(1);
    expect(JSON.stringify(items)).not.toContain("SECRET");
    expect(items[0]?.read?.itemName).toBe("Lotion or cream");
    store.setConsent(true);
    store.override("item-1", { itemName: "GRANDMA ROSE WATER" });
    await store.settled();
    const after = (await admin((d) => getDocs(collection(d, "boxes/b2/items")))).docs.map((d) => d.data());
    expect(JSON.stringify(after)).not.toMatch(/SECRET|GRANDMA/);
  });

  it("deletes the consent an older version saved on a box, and two tabs that both found no box never overwrite it", async () => {
    await admin((d) => setDoc(doc(d, "boxes/b4"), { ownerUid: "alice", memberUids: ["alice"], joinKeyHash: "", destinationCode: "CA", editionId: "old", cloudConsent: true }));
    await firestorePersistence(db("alice"), "alice", "byt-test").putMeta("b4", meta());
    expect("cloudConsent" in ((await at("boxes/b4")) ?? {})).toBe(false);
    // Two tabs, both of which found no box: one creates it, the other's details merge into it.
    const a = firestorePersistence(db("alice"), "alice", "byt-test");
    const b = firestorePersistence(db("alice"), "alice", "byt-test");
    expect(await Promise.all([a.loadBox("b5"), b.loadBox("b5")])).toEqual([{ status: "missing" }, { status: "missing" }]);
    await Promise.all([a.putMeta("b5", meta({ destinationCode: "PH" })), b.putMeta("b5", meta())]);
    await a.putItem("b5", item("first"));
    await b.putItem("b5", item("late"));
    expect(await at("boxes/b5")).toMatchObject({ ownerUid: "alice", memberUids: ["alice"] });
    expect(await at("boxes/b5/items/late")).toBeDefined();
    expect(await at("boxes/b5/items/first")).toBeDefined();
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

});
