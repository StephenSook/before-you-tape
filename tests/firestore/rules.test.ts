// Firestore rules (spec 5.8), run against the local emulator: npm run test:rules.
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, setDoc, updateDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let env: RulesTestEnvironment;
let alice: Firestore;
let bob: Firestore;
let nobody: Firestore;

const boxFor = (uid: string) => ({ ownerUid: uid, memberUids: [uid], joinKeyHash: "", destinationCode: "CA", editionId: "byt-test" });
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
    };
    await assertSucceeds(setDoc(doc(alice, "boxes/b1/disputes/i1"), disputes));
    // Every fact at once, with long tag lists: inside one request's evaluation limit.
    const flag = { device: true, cloud: false, resolved: false };
    const tags = ["alcohol", "battery_label", "cosmetic", "electronics", "flammable", "label_text", "li_ion", "liquid", "power_bank_label", "pressurized"];
    const every = { ...disputes, batteryWords: flag, liquid: flag, pressurized: flag, alcoholOnLabel: flag, glassContainer: flag, powder: flag,
      labelTags: { device: tags, cloud: tags.slice(0, 5), resolved: false } };
    await assertSucceeds(setDoc(doc(alice, "boxes/b1/disputes/i3"), every));
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
