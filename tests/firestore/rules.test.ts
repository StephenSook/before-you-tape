// Firestore rules (spec 5.8), run against the local emulator: npm run test:rules.
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, setDoc, Timestamp, updateDoc, writeBatch, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let env: RulesTestEnvironment;
let alice: Firestore;
let bob: Firestore;
let nobody: Firestore;

// A box lasts 37 days from its creation (its anonymous owner may be removed after 30); its items and disputes
// carry the same time, so Firestore's TTL policy deletes them together.
const DAY = 86_400_000;
const EXPIRES = Timestamp.fromMillis(Date.now() + 37 * DAY);
// A tombstone outlives its box by 30 days, so TTL never removes it before anything the box left behind.
const RETIRED = Timestamp.fromMillis(EXPIRES.toMillis() + 30 * DAY);
const boxFor = (uid: string) => ({ ownerUid: uid, memberUids: [uid], joinKeyHash: "", destinationCode: "CA", editionId: "byt-test", expiresAt: EXPIRES });
// An item as the box store saves it: the read with its label text emptied, never sent.
const itemDoc = {
  itemId: "i1",
  read: {
    itemName: "Body lotion", category: "lotion_cream", labelText: "", volts: 0, milliampHours: 0, wattHours: 0, lithiumGrams: 0,
    batteryWords: false, liquid: true, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false, glassContainer: false,
    powder: false, retailBox: "cannot_tell", evidence: "label_read",
  },
  overrides: {}, answers: {}, quantity: 1, identityConfirmedBy: null, labelTags: ["cosmetic"], readSource: "on_device", readMs: 1200,
  secondLook: null, cropKey: "k1",
  customs: { description: "", lintOk: false, weightOz: null, valueUsd: null, countryOfOrigin: null, upc: null },
  expiresAt: EXPIRES,
};

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-before-you-tape", firestore: { rules: readFileSync("firestore.rules", "utf8") } });
  alice = env.authenticatedContext("alice").firestore() as unknown as Firestore;
  bob = env.authenticatedContext("bob").firestore() as unknown as Firestore;
  nobody = env.unauthenticatedContext().firestore() as unknown as Firestore;
});
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe("boxes", () => {
  it("member-only boxes, and no client change of membership", async () => {
    await assertSucceeds(setDoc(doc(alice, "boxes/b1"), boxFor("alice")));
    await assertSucceeds(getDoc(doc(alice, "boxes/b1")));
    await assertFails(getDoc(doc(bob, "boxes/b1")));
    await assertFails(getDoc(doc(nobody, "boxes/b1")));
    await assertSucceeds(updateDoc(doc(alice, "boxes/b1"), { destinationCode: "PH" }));
    await assertFails(updateDoc(doc(alice, "boxes/b1"), { ownerUid: "bob" }));
    await assertFails(updateDoc(doc(alice, "boxes/b1"), { memberUids: ["alice", "bob"] }));
    await assertFails(updateDoc(doc(alice, "boxes/b1"), { joinKeyHash: "x" }));
    await assertFails(updateDoc(doc(bob, "boxes/b1"), { destinationCode: "PH" }));
  });

  it("keeps no consent on a box: refuses it on create and any set or change, and lets an old answer be deleted", async () => {
    for (const consent of [true, false, null]) await assertFails(setDoc(doc(alice, "boxes/c0"), { ...boxFor("alice"), cloudConsent: consent }));
    await assertFails(setDoc(doc(alice, "boxes/c0"), { ...boxFor("alice"), consentChosenAt: 5 }));
    await assertSucceeds(setDoc(doc(alice, "boxes/c1"), boxFor("alice")));
    await assertFails(updateDoc(doc(alice, "boxes/c1"), { cloudConsent: true }));
    // A box an older version saved with an answer: it may stay as it is or be deleted, never changed.
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore() as unknown as Firestore, "boxes/c2"), { ...boxFor("alice"), cloudConsent: true });
    });
    await assertSucceeds(updateDoc(doc(alice, "boxes/c2"), { destinationCode: "PH" }));
    await assertFails(updateDoc(doc(alice, "boxes/c2"), { cloudConsent: false }));
    await assertSucceeds(updateDoc(doc(alice, "boxes/c2"), { cloudConsent: deleteField() }));
    expect("cloudConsent" in ((await getDoc(doc(alice, "boxes/c2"))).data() ?? {})).toBe(false);
    await assertFails(updateDoc(doc(alice, "boxes/c2"), { cloudConsent: true }));
  });

  it("lets a signed-in user learn only that a box id is free", async () => {
    await assertSucceeds(getDoc(doc(alice, "boxes/free")));
    await assertFails(getDoc(doc(nobody, "boxes/free")));
  });

  it("starts a box only as its sole owner with no join key", async () => {
    await assertFails(setDoc(doc(alice, "boxes/b2"), { ...boxFor("alice"), ownerUid: "bob" }));
    await assertFails(setDoc(doc(alice, "boxes/b2"), { ...boxFor("alice"), memberUids: ["alice", "bob"] }));
    await assertFails(setDoc(doc(alice, "boxes/b2"), { ...boxFor("alice"), joinKeyHash: "abc" }));
    await assertFails(setDoc(doc(nobody, "boxes/b2"), boxFor("alice")));
  });

  // Deleting a box writes a tombstone for its id in the same batch. Without one, a deleted box's id would read as
  // free, and anyone who started it again would become the member of anything it left behind.
  const retire = async (db: Firestore, id: string, expiresAt: unknown = RETIRED) => {
    const batch = writeBatch(db);
    batch.set(doc(db, `retiredBoxes/${id}`), { expiresAt });
    batch.delete(doc(db, `boxes/${id}`));
    await batch.commit();
  };

  it("lets the owner delete a box only together with its tombstone, and never lets its id start again", async () => {
    await assertSucceeds(setDoc(doc(alice, "boxes/b3"), boxFor("alice")));
    await assertFails(deleteDoc(doc(alice, "boxes/b3")));
    await assertSucceeds(retire(alice, "b3"));
    let stillThere = true;
    await env.withSecurityRulesDisabled(async (c) => { stillThere = (await getDoc(doc(c.firestore() as unknown as Firestore, "boxes/b3"))).exists(); });
    expect(stillThere).toBe(false);
    await assertFails(setDoc(doc(alice, "boxes/b3"), boxFor("alice")));
    const eve = env.authenticatedContext("eve").firestore() as unknown as Firestore;
    await assertFails(setDoc(doc(eve, "boxes/b3"), boxFor("eve")));
  });

  it("never lets a member who is not the owner, a stranger or a signed-out visitor delete or retire a box", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore() as unknown as Firestore, "boxes/b4"), { ...boxFor("alice"), memberUids: ["alice", "bob"] });
    });
    const eve = env.authenticatedContext("eve").firestore() as unknown as Firestore;
    for (const db of [bob, eve, nobody]) {
      await assertFails(retire(db, "b4"));
      await assertFails(deleteDoc(doc(db, "boxes/b4")));
    }
    expect((await assertSucceeds(getDoc(doc(alice, "boxes/b4")))).exists()).toBe(true);
  });

  it("keeps a tombstone 30 days past its box's expiry, written only while its box is deleted, and out of every client's reach", async () => {
    await assertSucceeds(setDoc(doc(alice, "boxes/b5"), boxFor("alice")));
    // Alone, with the box's own expiry or any other, or with anything else in it: refused.
    await assertFails(setDoc(doc(alice, "retiredBoxes/b5"), { expiresAt: RETIRED }));
    await assertFails(retire(alice, "b5", EXPIRES));
    await assertFails(retire(alice, "b5", Timestamp.fromMillis(RETIRED.toMillis() + 1000)));
    const batch = writeBatch(alice);
    batch.set(doc(alice, "retiredBoxes/b5"), { expiresAt: RETIRED, note: "x" });
    batch.delete(doc(alice, "boxes/b5"));
    await assertFails(batch.commit());
    // For an id with no box (a first save may still be on its way): only with an expiry 67 days out, the box's 37
    // plus 30, and never by a signed-out visitor.
    const UNUSED = Timestamp.fromMillis(Date.now() + 67 * DAY);
    await assertFails(setDoc(doc(nobody, "retiredBoxes/never"), { expiresAt: UNUSED }));
    await assertFails(setDoc(doc(alice, "retiredBoxes/never"), { expiresAt: EXPIRES }));
    await assertFails(setDoc(doc(alice, "retiredBoxes/never"), { expiresAt: UNUSED, note: "x" }));
    await assertSucceeds(setDoc(doc(alice, "retiredBoxes/never"), { expiresAt: UNUSED }));
    await assertFails(setDoc(doc(alice, "boxes/never"), boxFor("alice")));
    await assertSucceeds(retire(alice, "b5"));
    await assertFails(getDoc(doc(alice, "retiredBoxes/b5")));
    await assertFails(updateDoc(doc(alice, "retiredBoxes/b5"), { expiresAt: RETIRED }));
    await assertFails(deleteDoc(doc(alice, "retiredBoxes/b5")));
  });
});

describe("expiry", () => {
  const box = (expiresAt: unknown) => ({ ...boxFor("alice"), expiresAt });

  it("starts a box only with an expiry 36 to 38 days out, as a time", async () => {
    const { expiresAt: _none, ...noExpiry } = boxFor("alice");
    void _none;
    await assertFails(setDoc(doc(alice, "boxes/e1"), noExpiry));
    await assertFails(setDoc(doc(alice, "boxes/e1"), box(Timestamp.fromMillis(Date.now() + DAY))));
    await assertFails(setDoc(doc(alice, "boxes/e1"), box(Timestamp.fromMillis(Date.now() + 60 * DAY))));
    await assertFails(setDoc(doc(alice, "boxes/e1"), box(EXPIRES.toMillis())));
    await assertSucceeds(setDoc(doc(alice, "boxes/e1"), box(EXPIRES)));
  });

  it("never lets a client change, remove or add a box's expiry", async () => {
    await assertSucceeds(setDoc(doc(alice, "boxes/e2"), box(EXPIRES)));
    await assertSucceeds(updateDoc(doc(alice, "boxes/e2"), { destinationCode: "PH" }));
    await assertFails(updateDoc(doc(alice, "boxes/e2"), { expiresAt: Timestamp.fromMillis(EXPIRES.toMillis() + DAY) }));
    await assertFails(updateDoc(doc(alice, "boxes/e2"), { expiresAt: deleteField() }));
    // A box from before expiry: it keeps working, and only the one-time backfill (admin) gives it an expiry.
    await env.withSecurityRulesDisabled(async (c) => {
      const { expiresAt: _none, ...legacy } = boxFor("alice");
      void _none;
      await setDoc(doc(c.firestore() as unknown as Firestore, "boxes/e3"), legacy);
    });
    await assertSucceeds(updateDoc(doc(alice, "boxes/e3"), { destinationCode: "PH" }));
    await assertFails(updateDoc(doc(alice, "boxes/e3"), { expiresAt: EXPIRES }));
  });

  // A dispute's shape check does not test for device and cloud by name, to stay under the 1000-expression limit:
  // a missing one is refused where it is read. This pins that refusal.
  it("refuses a dispute missing its device or cloud reading, whatever stands in its place", async () => {
    await assertSucceeds(setDoc(doc(alice, "boxes/e6"), box(EXPIRES)));
    const missing: Array<Record<string, unknown>> = [
      { liquid: { cloud: false, resolved: false, extra: true } },
      { liquid: { device: true, resolved: false, extra: true } },
      { category: { cloud: "phone", resolved: false, extra: 1 } },
      { battery: { cloud: { volts: 3.7, milliampHours: 1, wattHours: 1 }, resolved: false, extra: 1 } },
      { labelTags: { device: ["flammable"], resolved: false, extra: 1 } },
      { retailBox: { cloud: "sealed", resolved: false, extra: 1 } },
      { lithiumGrams: { device: 1, resolved: false, extra: 1 } },
    ];
    for (const m of missing) await assertFails(setDoc(doc(alice, "boxes/e6/disputes/i1"), { ...m, expiresAt: EXPIRES }));
    await assertSucceeds(setDoc(doc(alice, "boxes/e6/disputes/i1"), { liquid: { device: true, cloud: false, resolved: false }, expiresAt: EXPIRES }));
  });

  it("gives items and disputes their box's expiry exactly, and never lets it change", async () => {
    await assertSucceeds(setDoc(doc(alice, "boxes/e4"), box(EXPIRES)));
    const { expiresAt: _none, ...itemNoExpiry } = itemDoc;
    void _none;
    await assertFails(setDoc(doc(alice, "boxes/e4/items/i1"), itemNoExpiry));
    await assertFails(setDoc(doc(alice, "boxes/e4/items/i1"), { ...itemDoc, expiresAt: Timestamp.fromMillis(EXPIRES.toMillis() + 1000) }));
    await assertSucceeds(setDoc(doc(alice, "boxes/e4/items/i1"), itemDoc));
    await assertSucceeds(updateDoc(doc(alice, "boxes/e4/items/i1"), { quantity: 2 }));
    await assertFails(updateDoc(doc(alice, "boxes/e4/items/i1"), { expiresAt: Timestamp.fromMillis(EXPIRES.toMillis() + DAY) }));
    await assertFails(updateDoc(doc(alice, "boxes/e4/items/i1"), { expiresAt: deleteField() }));
    const flag = { device: true, cloud: false, resolved: false };
    await assertFails(setDoc(doc(alice, "boxes/e4/disputes/i1"), { liquid: flag }));
    await assertSucceeds(setDoc(doc(alice, "boxes/e4/disputes/i1"), { liquid: flag, expiresAt: EXPIRES }));
    await assertFails(updateDoc(doc(alice, "boxes/e4/disputes/i1"), { expiresAt: deleteField() }));
    // Items of a box from before expiry have none, as their box.
    await env.withSecurityRulesDisabled(async (c) => {
      const { expiresAt: _b, ...legacy } = boxFor("alice");
      void _b;
      await setDoc(doc(c.firestore() as unknown as Firestore, "boxes/e5"), legacy);
    });
    await assertSucceeds(setDoc(doc(alice, "boxes/e5/items/i1"), itemNoExpiry));
    await assertFails(setDoc(doc(alice, "boxes/e5/items/i2"), itemDoc));
  });
});

describe("items", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore() as unknown as Firestore, "boxes/b1"), { ...boxFor("alice"), memberUids: ["alice", "carol"] });
    });
  });

  it("lets members write and read items with no label text", async () => {
    await assertSucceeds(setDoc(doc(alice, "boxes/b1/items/i1"), itemDoc));
    await assertSucceeds(getDoc(doc(alice, "boxes/b1/items/i1")));
    const carol = env.authenticatedContext("carol").firestore() as unknown as Firestore;
    await assertSucceeds(updateDoc(doc(carol, "boxes/b1/items/i1"), { quantity: 2 }));
    await assertFails(getDoc(doc(bob, "boxes/b1/items/i1")));
    await assertFails(setDoc(doc(bob, "boxes/b1/items/i2"), itemDoc));
  });

  it("refuses an item document that carries label text", async () => {
    await assertFails(setDoc(doc(alice, "boxes/b1/items/i1"), { ...itemDoc, read: { ...itemDoc.read, labelText: "JANE DOE 10 MG" } }));
    await assertFails(setDoc(doc(alice, "boxes/b1/items/i1"), { ...itemDoc, overrides: { labelText: "JANE DOE 10 MG" } }));
    const { labelText: _gone, ...noField } = itemDoc.read;
    void _gone;
    await assertFails(setDoc(doc(alice, "boxes/b1/items/i1"), { ...itemDoc, read: noField }));
  });
});

describe("schema", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore() as unknown as Firestore, "boxes/b1"), boxFor("alice"));
    });
  });

  it("refuses fields the box does not have, wrong types, and oversized values", async () => {
    await assertFails(setDoc(doc(alice, "boxes/b9"), { ...boxFor("alice"), extra: "x" }));
    await assertFails(setDoc(doc(alice, "boxes/b9"), { ...boxFor("alice"), cloudConsent: "yes" }));
    await assertFails(setDoc(doc(alice, "boxes/b9"), { ...boxFor("alice"), destinationCode: "CANADA" }));
    await assertFails(updateDoc(doc(alice, "boxes/b1"), { extra: "x" }));
    await assertFails(updateDoc(doc(alice, "boxes/b1"), { editionId: "e".repeat(200) }));
    await assertSucceeds(updateDoc(doc(alice, "boxes/b1"), { sources: { onDevice: 1, inCloud: 0, secondLooks: 0, rulesOnlyRechecks: 0, cloudFallbacks: 0 } }));
    await assertFails(updateDoc(doc(alice, "boxes/b1"), { sources: { onDevice: "1" } }));
  });

  it("refuses an item with an unknown field, a huge name, a bad quantity or an unknown source", async () => {
    await assertSucceeds(setDoc(doc(alice, "boxes/b1/items/i1"), itemDoc));
    await assertFails(setDoc(doc(alice, "boxes/b1/items/i2"), { ...itemDoc, extra: "x" }));
    await assertFails(setDoc(doc(alice, "boxes/b1/items/i2"), { ...itemDoc, read: { ...itemDoc.read, itemName: "x".repeat(5000) } }));
    await assertFails(setDoc(doc(alice, "boxes/b1/items/i2"), { ...itemDoc, read: { ...itemDoc.read, extra: 1 } }));
    await assertFails(setDoc(doc(alice, "boxes/b1/items/i2"), { ...itemDoc, quantity: 0 }));
    await assertFails(setDoc(doc(alice, "boxes/b1/items/i2"), { ...itemDoc, quantity: 100 }));
    await assertFails(setDoc(doc(alice, "boxes/b1/items/i2"), { ...itemDoc, readSource: "somewhere" }));
    // The sample photo's recorded read keeps its own source when the box is shared.
    await assertSucceeds(setDoc(doc(alice, "boxes/b1/items/i3"), { ...itemDoc, readSource: "sample_recorded" }));
    await assertFails(updateDoc(doc(alice, "boxes/b1/items/i1"), { labelTags: "alcohol" }));
    // Each tag must be one known tag, whole.
    await assertSucceeds(updateDoc(doc(alice, "boxes/b1/items/i1"), { labelTags: ["alcohol_flag", "toy_gun", "label_text"] }));
    await assertSucceeds(updateDoc(doc(alice, "boxes/b1/items/i1"), { labelTags: [] }));
    for (const labelTags of [["not_a_tag"], ["alcohol", "not_a_tag"], ["alcohol,toy"], [""], ["alcohol", ""], [1], ["ALCOHOL"], ["toy_gunx"]]) {
      await assertFails(updateDoc(doc(alice, "boxes/b1/items/i1"), { labelTags }));
    }
    await assertFails(updateDoc(doc(alice, "boxes/b1/items/i1"), { read: { ...itemDoc.read, category: "phonex" } }));
    await assertFails(updateDoc(doc(alice, "boxes/b1/items/i1"), { overrides: { category: "spaceship" } }));
    await assertSucceeds(updateDoc(doc(alice, "boxes/b1/items/i1"), { overrides: { category: "toy_gun" } }));
    await assertSucceeds(updateDoc(doc(alice, "boxes/b1/items/i1"), { secondLook: { ms: 900, reason: "The cloud looked again." }, readFallback: { after: "503", route: "cloud_only" } }));
    // The item never carries anything about its disputes.
    await assertFails(updateDoc(doc(alice, "boxes/b1/items/i1"), { secondLook: { ms: 900, reason: "r", rev: "a1b2c3d4" } }));
  });

  it("keeps a second look's disputes in their own document, with no label text, and refuses any other shape", async () => {
    const disputes = {
      category: { device: "power_bank", cloud: "phone", resolved: false },
      retailBox: { device: "open_or_none", cloud: "sealed", resolved: false },
      battery: { device: { volts: 3.7, milliampHours: 2500, wattHours: 9.25 }, cloud: { volts: 3.7, milliampHours: 2600, wattHours: 9.62 }, resolved: true },
      lithiumGrams: { device: 2.5, cloud: 0, resolved: false },
      flammableOnLabel: { device: true, cloud: false, resolved: false },
      labelTags: { device: ["flammable", "label_text"], cloud: ["label_text"], resolved: false },
      evidence: { device: "not_sure", cloud: "label_read", resolved: false },
      expiresAt: EXPIRES,
    };
    await assertSucceeds(setDoc(doc(alice, "boxes/b1/disputes/i1"), disputes));
    // Every fact at once, with long tag lists: inside one request's evaluation limit.
    const flag = { device: true, cloud: false, resolved: false };
    const tags = ["alcohol", "battery_label", "cosmetic", "electronics", "flammable", "label_text", "li_ion", "liquid", "power_bank_label", "pressurized"];
    const every = { ...disputes, batteryWords: flag, liquid: flag, pressurized: flag, alcoholOnLabel: flag, glassContainer: flag, powder: flag,
      labelTags: { device: tags, cloud: tags.slice(0, 5), resolved: false } };
    await assertSucceeds(setDoc(doc(alice, "boxes/b1/disputes/i3"), { ...every, itemRev: "a1b2c3d4" }));
    // The heaviest item: every correction, many tags, a second look with its revision.
    const overrides = { itemName: "Power bank", category: "power_bank", volts: 3.7, milliampHours: 10000, wattHours: 37, lithiumGrams: 0,
      batteryWords: true, liquid: false, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false, glassContainer: false,
      powder: false, retailBox: "sealed", evidence: "label_read" };
    await assertSucceeds(setDoc(doc(alice, "boxes/b1/items/i9"), { ...itemDoc, itemId: "i9", overrides, labelTags: tags, addedAt: 1795000000000,
      answers: { battery_installed: "installed", cell_count: "one", device_condition: "new_sealed", label_alcohol: "no", label_alcohol_free: "yes" },
      secondLook: { ms: 900, reason: "The cloud looked again." }, readFallback: { after: "503", route: "cloud_only" } }));
    // Only a member of the box may read or write it.
    await assertFails(setDoc(doc(bob, "boxes/b1/disputes/i4"), disputes));
    await assertFails(getDoc(doc(bob, "boxes/b1/disputes/i1")));
    await assertSucceeds(getDoc(doc(alice, "boxes/b1/disputes/i1")));
    const bad: Array<Record<string, unknown>> = [
      {},
      { ...disputes, colour: { device: "red", cloud: "blue", resolved: false } },
      { labelTags: { device: "FLAMMABLE BODY LOTION", cloud: "", resolved: false } },
      { labelTags: { device: ["shea butter body lotion"], cloud: [], resolved: false } },
      { labelTags: { device: ["flammable", ""], cloud: [], resolved: false } },
      { labelTags: { device: [7], cloud: [], resolved: false } },
      { category: { device: "spaceship", cloud: "phone", resolved: false } },
      { category: { device: "phone", cloud: "tablet" } },
      { category: { device: "phone", cloud: "tablet", resolved: "no" } },
      { category: { device: "phone", cloud: "tablet", resolved: false, label: "IPHONE" } },
      { retailBox: { device: "maybe", cloud: "sealed", resolved: false } },
      { lithiumGrams: { device: -1, cloud: 0, resolved: false } },
      { battery: { device: { volts: 3.7 }, cloud: { volts: 3.7, milliampHours: 1, wattHours: 1 }, resolved: false } },
      { battery: { device: { volts: 3.7, milliampHours: 1, colour: 1 }, cloud: { volts: 3.7, milliampHours: 1, wattHours: 1 }, resolved: false } },
      { category: { device: "phone", cloud: "tablet", resolved: false, extra: 1 } },
      { category: { device: "phone", resolved: false, extra: 1 } },
      { retailBox: { device: "sealed!", cloud: "sealed", resolved: false } },
      { liquid: { device: "yes", cloud: false, resolved: false } },
      { evidence: { device: "guessed", cloud: "label_read", resolved: false } },
      { ...disputes, itemRev: 7 },
      { ...disputes, itemRev: "x".repeat(40) },
      { itemRev: "a1b2c3d4" },
      { ...disputes, rev: "a1b2c3d4" },
    ];
    for (const d of bad) await assertFails(setDoc(doc(alice, "boxes/b1/disputes/i2"), d));
  });

  it("accepts an item's added time as a positive whole number of milliseconds, and nothing else", async () => {
    await assertSucceeds(setDoc(doc(alice, "boxes/b1/items/i1"), { ...itemDoc, addedAt: 1795000000000 }));
    await assertSucceeds(setDoc(doc(alice, "boxes/b1/items/i2"), itemDoc));
    await assertFails(setDoc(doc(alice, "boxes/b1/items/i3"), { ...itemDoc, addedAt: "2026-11-18" }));
    await assertFails(setDoc(doc(alice, "boxes/b1/items/i3"), { ...itemDoc, addedAt: 1.5 }));
    await assertFails(setDoc(doc(alice, "boxes/b1/items/i3"), { ...itemDoc, addedAt: 0 }));
  });

  it("type-checks every read field and keeps tags, answers and categories to the edition's own words", async () => {
    const bad = [
      { read: { ...itemDoc.read, volts: "x".repeat(10000) } },
      { read: { ...itemDoc.read, milliampHours: -1 } },
      { read: { ...itemDoc.read, liquid: "yes" } },
      { read: { ...itemDoc.read, category: "spaceship" } },
      { read: { ...itemDoc.read, evidence: "guess" } },
      { overrides: { volts: "12" } },
      { labelTags: ["cosmetic", "x".repeat(5000)] },
      { answers: { battery_installed: "maybe" } },
      { answers: { favourite_color: "blue" } },
    ];
    for (const patch of bad) await assertFails(setDoc(doc(alice, "boxes/b1/items/i3"), { ...itemDoc, ...patch }));
    await assertSucceeds(setDoc(doc(alice, "boxes/b1/items/i3"), {
      ...itemDoc, labelTags: ["alcohol", "label_text", "alcohol_free_unsure"], answers: { battery_installed: "installed", label_alcohol: "no" },
      overrides: { wattHours: 9.62, flammableOnLabel: true, retailBox: "sealed" },
    }));
  });

  it("refuses an item in a box that does not exist", async () =>
    assertFails(setDoc(doc(alice, "boxes/none/items/i1"), itemDoc)));
});

describe("public and admin-only data", () => {
  it("lets signed-in users read only public data", async () => {
    for (const p of ["ruleEditions/e1", "evalSets/s1", "evalPublic/r1", "publicStats/senders"]) {
      await assertSucceeds(getDoc(doc(alice, p)));
      await assertFails(setDoc(doc(alice, p), { a: 1 }));
      await assertFails(getDoc(doc(nobody, p)));
    }
    for (const p of ["evalRuns/r1", "senderSessions/x1", "listingQuota/alice"]) await assertFails(getDoc(doc(alice, p)));
    await assertFails(getDocs(collection(alice, "blindSessions/open/calls")));
  });
});
