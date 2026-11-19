// The join callables' handlers against the Firestore emulator, through the Admin SDK as in production.
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { joinBoxHandler, startJoinHandler } from "./handlers";
import { joinKeyHash, JOIN_KEY_TTL_MS } from "./join";

// Never against a real project: these tests write boxes.
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("run with the Firestore emulator (npm run test:rules)");
const db = getFirestore(initializeApp({ projectId: "demo-before-you-tape" }, "join-handlers"));
let n = 0;
const newBox = async (over: Record<string, unknown> = {}) => {
  const id = `join-box-${n++}`;
  await db.doc(`boxes/${id}`).set({ ownerUid: "laptop", memberUids: ["laptop"], joinKeyHash: "", destinationCode: "CA", editionId: "byt-test", cloudConsent: true, ...over });
  return id;
};
const box = async (id: string) => (await db.doc(`boxes/${id}`).get()).data() ?? {};
const T = 1_800_000_000_000;

describe("startJoinHandler", () => {
  it("gives the box's owner a 26-character code, and keeps only its hash and when it stops working", async () => {
    const id = await newBox();
    const { key, expiresAt } = await startJoinHandler(db, "laptop", { boxId: id }, T);
    expect(key).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(expiresAt).toBe(T + JOIN_KEY_TTL_MS);
    const saved = await box(id);
    expect(saved).toMatchObject({ joinKeyHash: joinKeyHash(key), joinKeyExpiresAt: T + JOIN_KEY_TTL_MS });
    expect(JSON.stringify(saved)).not.toContain(key);
  });

  it("refuses anyone but the owner, a visitor who is not signed in, a bad box id and a box that does not exist", async () => {
    const id = await newBox();
    await expect(startJoinHandler(db, "phone", { boxId: id }, T)).rejects.toMatchObject({ code: "permission-denied" });
    await expect(startJoinHandler(db, undefined, { boxId: id }, T)).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(startJoinHandler(db, "laptop", { boxId: "a/b" }, T)).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(startJoinHandler(db, "laptop", { boxId: "no-such-box" }, T)).rejects.toMatchObject({ code: "not-found" });
    expect((await box(id)).joinKeyHash).toBe("");
  });
});

describe("joinBoxHandler", () => {
  it("adds a phone that brings the code in time, and the code then stops working", async () => {
    const id = await newBox();
    const { key } = await startJoinHandler(db, "laptop", { boxId: id }, T);
    await expect(joinBoxHandler(db, "phone", { boxId: id, key: key.toLowerCase() }, T + 1)).resolves.toEqual({ boxId: id, joined: true });
    const after = await box(id);
    expect(after.memberUids).toEqual(["laptop", "phone"]);
    expect(after.joinKeyHash).toBe("");
    expect("joinKeyExpiresAt" in after).toBe(false);
    await expect(joinBoxHandler(db, "phone-2", { boxId: id, key }, T + 2)).rejects.toMatchObject({ code: "permission-denied" });
    // A member coming back needs no code.
    await expect(joinBoxHandler(db, "phone", { boxId: id, key }, T + 3)).resolves.toEqual({ boxId: id, joined: false });
  });

  it("refuses a late code, a wrong code, a full box and a bad request, and adds no one", async () => {
    const late = await newBox();
    const { key } = await startJoinHandler(db, "laptop", { boxId: late }, T);
    await expect(joinBoxHandler(db, "phone", { boxId: late, key }, T + JOIN_KEY_TTL_MS)).rejects.toMatchObject({ code: "deadline-exceeded" });
    await expect(joinBoxHandler(db, "phone", { boxId: late, key: "A".repeat(26) }, T)).rejects.toMatchObject({ code: "permission-denied" });
    const full = await newBox({ memberUids: ["laptop", "p1", "p2"] });
    const code = (await startJoinHandler(db, "laptop", { boxId: full }, T)).key;
    await expect(joinBoxHandler(db, "p3", { boxId: full, key: code }, T)).rejects.toMatchObject({ code: "resource-exhausted" });
    await expect(joinBoxHandler(db, "phone", { boxId: late, key: "short" }, T)).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(joinBoxHandler(db, undefined, { boxId: late, key }, T)).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(joinBoxHandler(db, "phone", { boxId: "no-such-box", key }, T)).rejects.toMatchObject({ code: "permission-denied" });
    expect((await box(late)).memberUids).toEqual(["laptop"]);
    expect((await box(full)).memberUids).toEqual(["laptop", "p1", "p2"]);
  });
});
