// Firestore rules (spec 5.8), run against the local emulator: npm run test:rules.
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let env: RulesTestEnvironment;
let alice: Firestore;
let bob: Firestore;
let nobody: Firestore;

const boxFor = (uid: string) => ({ ownerUid: uid, memberUids: [uid], joinKeyHash: "", destinationCode: "CA", editionId: "byt-test", cloudConsent: null });
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

  it("takes a consent change only with a newer press time and the server's time, and never on create", async () => {
    await assertFails(setDoc(doc(alice, "boxes/c0"), { ...boxFor("alice"), cloudConsent: true }));
    await assertFails(setDoc(doc(alice, "boxes/c0"), { ...boxFor("alice"), consentChosenAt: 5, consentAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(alice, "boxes/c1"), boxFor("alice")));
    const say = (consent: boolean | null, at: number) => updateDoc(doc(alice, "boxes/c1"), { cloudConsent: consent, consentChosenAt: at, consentAt: serverTimestamp() });
    await assertSucceeds(say(true, 100));
    await assertSucceeds(say(false, 200));
    // An older press, arriving late, cannot undo the newer one; neither can the same press time again.
    await assertFails(say(true, 150));
    await assertFails(say(true, 200));
    // Without the server's time, or without a press time, consent does not change.
    await assertFails(updateDoc(doc(alice, "boxes/c1"), { cloudConsent: true, consentChosenAt: 300, consentAt: new Date(0) }));
    await assertFails(updateDoc(doc(alice, "boxes/c1"), { cloudConsent: true }));
    // An ordinary edit leaves consent as it is, and a full rewrite that drops it is refused.
    await assertSucceeds(updateDoc(doc(alice, "boxes/c1"), { destinationCode: "PH" }));
    await assertFails(setDoc(doc(alice, "boxes/c1"), boxFor("alice")));
    expect((await getDoc(doc(alice, "boxes/c1"))).data()).toMatchObject({ cloudConsent: false, consentChosenAt: 200 });
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

  it("lets only the owner delete a box", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore() as unknown as Firestore, "boxes/b3"), { ...boxFor("alice"), memberUids: ["alice", "bob"] });
    });
    await assertFails(deleteDoc(doc(bob, "boxes/b3")));
    await assertSucceeds(deleteDoc(doc(alice, "boxes/b3")));
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
    await assertFails(updateDoc(doc(alice, "boxes/b1/items/i1"), { labelTags: "alcohol" }));
    await assertSucceeds(updateDoc(doc(alice, "boxes/b1/items/i1"), { secondLook: { ms: 900, reason: "The cloud looked again." }, readFallback: { after: "503", route: "cloud_only" } }));
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
