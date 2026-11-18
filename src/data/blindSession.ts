// The reviewer's side of a private blind session: open it by its secret token, save each call, lock it.
// The rules refuse any call to a locked or missing session, and no client can read calls back.
import { doc, getDoc, serverTimestamp, setDoc, updateDoc, type Firestore } from "firebase/firestore";
import type { BlindCall } from "../pages/BlindPage";

export interface BlindSession { setId: string; locked: boolean }

export async function openSession(db: Firestore, token: string): Promise<BlindSession | null> {
  const snap = await getDoc(doc(db, "blindSessions", token));
  if (!snap.exists()) return null;
  const d = snap.data() as { setId?: unknown; lockedAt?: unknown };
  return { setId: typeof d.setId === "string" ? d.setId : "", locked: d.lockedAt != null };
}

export async function saveCall(db: Firestore, token: string, c: BlindCall): Promise<void> {
  await setDoc(doc(db, "blindSessions", token, "calls", `${c.itemId}_${c.destination}`), { ...c, at: serverTimestamp() });
}

export async function lockSession(db: Firestore, token: string): Promise<void> {
  await updateDoc(doc(db, "blindSessions", token), { lockedAt: serverTimestamp() });
}
