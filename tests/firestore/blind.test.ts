// Firestore rules for the private blind check, against the emulator: npm run test:rules.
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { lockSession, openSession, saveCall } from "../../src/data/blindSession";

let env: RulesTestEnvironment;
let alice: Firestore;
let nobody: Firestore;
const call = (patch: Record<string, unknown> = {}) => ({ itemId: "a", destination: "CA", call: "ship", ...patch });

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-before-you-tape", firestore: { rules: readFileSync("firestore.rules", "utf8") } });
  alice = env.authenticatedContext("reviewer-1").firestore() as unknown as Firestore;
  nobody = env.unauthenticatedContext().firestore() as unknown as Firestore;
});
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore() as unknown as Firestore;
    await setDoc(doc(d, "blindSessions/open"), { setId: "set-1", createdAt: Timestamp.now(), lockedAt: null });
    await setDoc(doc(d, "blindSessions/done"), { setId: "set-1", createdAt: Timestamp.now(), lockedAt: Timestamp.now() });
  });
});

describe("blind sessions", () => {
  it("accepts only the three values under an unlocked session and lets no client read calls", async () => {
    await assertSucceeds(setDoc(doc(alice, "blindSessions/open/calls/a_CA"), call()));
    for (const value of ["dont_ship", "depends"]) await assertSucceeds(setDoc(doc(alice, "blindSessions/open/calls/a_CA"), call({ call: value })));
    await assertFails(setDoc(doc(alice, "blindSessions/open/calls/a_CA"), call({ call: "maybe" })));
    await assertFails(getDoc(doc(alice, "blindSessions/open/calls/a_CA")));
    await assertFails(getDocs(collection(alice, "blindSessions/open/calls")));
  });

  it("refuses a call whose id does not match it, an extra field, a bad destination, or no sign-in", async () => {
    await assertFails(setDoc(doc(alice, "blindSessions/open/calls/b_CA"), call()));
    await assertFails(setDoc(doc(alice, "blindSessions/open/calls/a_CA"), call({ note: "hi" })));
    await assertFails(setDoc(doc(alice, "blindSessions/open/calls/a_CANADA"), call({ destination: "CANADA" })));
    await assertFails(setDoc(doc(nobody, "blindSessions/open/calls/a_CA"), call()));
  });

  it("refuses calls to a locked or missing session", async () => {
    await assertFails(setDoc(doc(alice, "blindSessions/done/calls/a_CA"), call()));
    await assertFails(setDoc(doc(alice, "blindSessions/missing/calls/a_CA"), call()));
  });

  it("lets a signed-in reviewer open a session by its token, but not list sessions or make one", async () => {
    await assertSucceeds(getDoc(doc(alice, "blindSessions/open")));
    await assertFails(getDoc(doc(nobody, "blindSessions/open")));
    await assertFails(getDocs(collection(alice, "blindSessions")));
    await assertFails(setDoc(doc(alice, "blindSessions/mine"), { setId: "set-1", createdAt: Timestamp.now(), lockedAt: null }));
  });

  it("locks once, with the server's time, and then refuses every change", async () => {
    await assertFails(updateDoc(doc(alice, "blindSessions/open"), { lockedAt: Timestamp.fromMillis(0) }));
    await assertFails(updateDoc(doc(alice, "blindSessions/open"), { lockedAt: serverTimestamp(), setId: "set-2" }));
    await assertSucceeds(updateDoc(doc(alice, "blindSessions/open"), { lockedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(alice, "blindSessions/open/calls/a_CA"), call()));
    await assertFails(updateDoc(doc(alice, "blindSessions/open"), { lockedAt: serverTimestamp() }));
  });
});

describe("blind session client", () => {
  it("opens a session by token, saves calls, then locks it so a later save is refused", async () => {
    expect(await openSession(alice, "open")).toEqual({ setId: "set-1", locked: false });
    await saveCall(alice, "open", { itemId: "a", destination: "CA", call: "depends" });
    await saveCall(alice, "open", { itemId: "a", destination: "CA", call: "ship" });
    await env.withSecurityRulesDisabled(async (c) => {
      const d = (await getDoc(doc(c.firestore() as unknown as Firestore, "blindSessions/open/calls/a_CA"))).data();
      expect(d).toMatchObject({ itemId: "a", destination: "CA", call: "ship" });
    });
    await lockSession(alice, "open");
    expect(await openSession(alice, "open")).toEqual({ setId: "set-1", locked: true });
    await expect(saveCall(alice, "open", { itemId: "a", destination: "PH", call: "ship" })).rejects.toBeTruthy();
  });

  it("reports a missing session as missing, and a locked one as locked", async () => {
    expect(await openSession(alice, "missing")).toBeNull();
    expect(await openSession(alice, "done")).toEqual({ setId: "set-1", locked: true });
  });
});
