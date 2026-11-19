// The two join callables' work, given the Admin SDK's Firestore, the caller's uid, the request data and
// the time, so the emulator tests run exactly what production runs. Membership and join codes change only
// here: the Firestore rules let no client touch them.
import { randomBytes } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { BOX_ID, KEY } from "../../src/shared/joinLink";
import { checkJoin, encodeJoinKey, joinKeyHash, JOIN_KEY_TTL_MS, type JoinableBox } from "./join";

const NOT_SIGNED_IN = "Sign in first.";
// One answer for a wrong code, a used code and a box that is not there, so a code cannot be used to probe.
const DID_NOT_WORK = "That code did not work. Show a new code on the laptop.";

function signedIn(uid: string | undefined): string {
  if (!uid) throw new HttpsError("unauthenticated", NOT_SIGNED_IN);
  return uid;
}

function field(data: unknown, name: string): unknown {
  return typeof data === "object" && data !== null ? (data as Record<string, unknown>)[name] : undefined;
}

function boxIdOf(data: unknown): string {
  const boxId = field(data, "boxId");
  if (typeof boxId !== "string" || !BOX_ID.test(boxId)) throw new HttpsError("invalid-argument", "That is not a box id.");
  return boxId;
}

// Makes a new code for the box, for its owner only, replacing any earlier one. Returns the code itself,
// which is never stored, and when it stops working.
export async function startJoinHandler(
  db: Firestore, uid: string | undefined, data: unknown, now: number, random: (n: number) => Uint8Array = randomBytes,
): Promise<{ key: string; expiresAt: number }> {
  const caller = signedIn(uid);
  const ref = db.doc(`boxes/${boxIdOf(data)}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "There is no such box.");
    if ((snap.data() as JoinableBox).ownerUid !== caller) throw new HttpsError("permission-denied", "Only the laptop that started this box can show a code.");
    const key = encodeJoinKey(random(16));
    const expiresAt = now + JOIN_KEY_TTL_MS;
    tx.update(ref, { joinKeyHash: joinKeyHash(key), joinKeyExpiresAt: expiresAt });
    return { key, expiresAt };
  });
}

// Adds the caller to the box when the code is right and in time, then clears the code so it works once.
// A member coming back is let in with no code.
export async function joinBoxHandler(db: Firestore, uid: string | undefined, data: unknown, now: number): Promise<{ boxId: string; joined: boolean }> {
  const caller = signedIn(uid);
  const boxId = boxIdOf(data);
  const raw = field(data, "key");
  const key = typeof raw === "string" ? raw.toUpperCase() : "";
  if (!KEY.test(key)) throw new HttpsError("invalid-argument", "That is not a join code.");
  const ref = db.doc(`boxes/${boxId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("permission-denied", DID_NOT_WORK);
    const verdict = checkJoin(snap.data() as JoinableBox, caller, joinKeyHash(key), now);
    if (verdict === "already_member") return { boxId, joined: false };
    if (verdict === "expired") throw new HttpsError("deadline-exceeded", "That code has run out. Show a new code on the laptop.");
    if (verdict === "full") throw new HttpsError("resource-exhausted", "This box already has two phones.");
    if (verdict !== "joined") throw new HttpsError("permission-denied", DID_NOT_WORK);
    tx.update(ref, { memberUids: FieldValue.arrayUnion(caller), joinKeyHash: "", joinKeyExpiresAt: FieldValue.delete() });
    return { boxId, joined: true };
  });
}
