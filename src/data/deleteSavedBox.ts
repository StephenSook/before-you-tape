// "Delete my saved box" on the web: the box in Firestore (its items, disputes and the box, with a tombstone),
// then this device's crops and box ids, then the anonymous sign-in. Each step must finish before the next; the
// first that fails stops the rest and is named, so the sender knows what is left.
export type DeleteStep = "box" | "crops" | "local" | "signIn";
export type DeleteResult = { ok: true; signIn: "deleted" | "signed_out" } | { ok: false; stoppedAt: DeleteStep };

export interface DeleteSavedBoxDeps {
  deleteBox(boxId: string): Promise<void>;
  deleteCrops(): Promise<unknown>;
  clearLocal(boxId: string): void;
  deleteSignIn(): Promise<void>;
  signOut(): Promise<void>;
}

export async function deleteSavedBox(boxId: string, d: DeleteSavedBoxDeps): Promise<DeleteResult> {
  try { await d.deleteBox(boxId); } catch { return { ok: false, stoppedAt: "box" }; }
  try { await d.deleteCrops(); } catch { return { ok: false, stoppedAt: "crops" }; }
  try { d.clearLocal(boxId); } catch { return { ok: false, stoppedAt: "local" }; }
  try {
    await d.deleteSignIn();
    return { ok: true, signIn: "deleted" };
  } catch (e) {
    // An old anonymous session cannot sign in again to prove itself, so it is signed out instead; Firebase removes
    // unused anonymous sign-ins on its own.
    if ((e as { code?: unknown } | null)?.code !== "auth/requires-recent-login") return { ok: false, stoppedAt: "signIn" };
    await d.signOut().catch(() => {});
    return { ok: true, signIn: "signed_out" };
  }
}

// The box's own keys in this browser: its saved copy, its journal of unsent changes, its item names and the pointer
// to it. The device's cloud answer is a choice about this device, not box data, so it stays.
export function clearLocalBox(storage: Storage, boxId: string): void {
  for (const key of [`byt.box.${boxId}`, `byt.journal.${boxId}`, `byt.names.${boxId}`, "byt.currentBox"]) storage.removeItem(key);
}

// A delete ends by reloading the page onto a new, empty box; this keeps how the sign-in went for that page to say once.
const DELETED_KEY = "byt.deleted";

export function rememberDeleted(storage: Storage, signIn: "deleted" | "signed_out"): void {
  try { storage.setItem(DELETED_KEY, signIn); } catch { /* the notice is a courtesy */ }
}

export function takeDeletedNotice(storage: Storage): "deleted" | "signed_out" | null {
  try {
    const v = storage.getItem(DELETED_KEY);
    storage.removeItem(DELETED_KEY);
    return v === "deleted" || v === "signed_out" ? v : null;
  } catch {
    return null;
  }
}
