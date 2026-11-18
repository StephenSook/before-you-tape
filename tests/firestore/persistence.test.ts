// Firestore persistence against the local emulator and the real rules: npm run test:rules.
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, collection, updateDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { BoxItem, BoxState } from "../../src/data/boxStore";
import { firestorePersistence } from "../../src/data/persistence";

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
    expect(box).toMatchObject({ ownerUid: "alice", memberUids: ["alice"], joinKeyHash: "", destinationCode: "CA", editionId: "byt-test", cloudConsent: true });
    const loaded = await firestorePersistence(db("alice"), "alice", "byt-test").load("b1");
    expect(loaded).toMatchObject({ boxId: "b1", destinationCode: "CA", cloudConsent: true, sources: { onDevice: 2 } });
    expect(loaded?.items?.map((i) => [i.itemId, i.quantity]).sort()).toEqual([["i1", 1], ["i2", 3]]);
  });

  it("never writes consent in an ordinary save of an existing box, only when the sender chose it", async () => {
    const first = firestorePersistence(db("alice"), "alice", "byt-test");
    await first.load("b1");
    first.save(state([], { cloudConsent: true }));
    await first.idle();
    first.saveConsent("b1", false);
    await first.idle();
    // Another tab, still holding the old answer, saves its box.
    const stale = firestorePersistence(db("alice"), "alice", "byt-test");
    await stale.load("b1");
    stale.save(state([item("i1")], { cloudConsent: true }));
    await stale.idle();
    const box = (await admin((d) => getDoc(doc(d, "boxes/b1")))).data();
    expect(box?.cloudConsent).toBe(false);
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
});
