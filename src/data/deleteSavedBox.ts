// "Delete my saved box" on the web: this page stops saving, then the box in Firestore (its items, disputes and the
// box, with a tombstone), this device's crops and box ids, then the anonymous sign-in. Each step must finish before
// the next; the first that fails stops the rest and is named, so the sender knows what is left, and a retry starts
// there, so a step already done is never run again over a box another tab may have started since.
export type DeleteStep = "box" | "crops" | "local" | "signIn";
export type DeleteResult = { ok: true; signIn: "deleted" | "signed_out" } | { ok: false; stoppedAt: DeleteStep };

export interface DeleteSavedBoxDeps {
  // Resolves once this page's writes already out have answered; nothing more is kept or sent.
  stopSaving(): Promise<void>;
  deleteBox(boxId: string): Promise<void>;
  deleteCrops(): Promise<unknown>;
  clearLocal(boxId: string): void;
  deleteSignIn(): Promise<void>;
  signOut(): Promise<void>;
}

const STEPS: DeleteStep[] = ["box", "crops", "local", "signIn"];

export async function deleteSavedBox(boxId: string, d: DeleteSavedBoxDeps, from: DeleteStep = "box"): Promise<DeleteResult> {
  const runs = (step: DeleteStep) => STEPS.indexOf(step) >= STEPS.indexOf(from);
  if (runs("box")) {
    try { await d.stopSaving(); await d.deleteBox(boxId); } catch { return { ok: false, stoppedAt: "box" }; }
  }
  if (runs("crops")) {
    try { await d.deleteCrops(); } catch { return { ok: false, stoppedAt: "crops" }; }
  }
  if (runs("local")) {
    try { d.clearLocal(boxId); } catch { return { ok: false, stoppedAt: "local" }; }
  }
  try {
    await d.deleteSignIn();
    return { ok: true, signIn: "deleted" };
  } catch (e) {
    // An old anonymous session cannot sign in again to prove itself, so it is signed out instead; Firebase removes
    // unused anonymous sign-ins on its own.
    if ((e as { code?: unknown } | null)?.code !== "auth/requires-recent-login") return { ok: false, stoppedAt: "signIn" };
    try { await d.signOut(); } catch { return { ok: false, stoppedAt: "signIn" }; }
    return { ok: true, signIn: "signed_out" };
  }
}

// The box's own keys in this browser: its saved copy, its journal of unsent changes, its item names, and the pointer
// to it while it still names this box. The device's cloud answer is a choice about this device, not box data, so it
// stays.
export function clearLocalBox(storage: Storage, boxId: string): void {
  for (const key of [`byt.box.${boxId}`, `byt.journal.${boxId}`, `byt.names.${boxId}`]) storage.removeItem(key);
  if (storage.getItem("byt.currentBox") === boxId) storage.removeItem("byt.currentBox");
}

// The live page's parts for a delete.
export interface DeleterParts {
  store: { getState(): { boxId: string; items: ReadonlyArray<{ cropKey: string | null }> }; close(): Promise<void> };
  // Settles once this page's own sign-in has finished, whether it worked or not.
  signedIn: Promise<unknown>;
  // Whoever is signed in now: another tab may have signed in after this page's own sign-in failed.
  currentUid: () => string | null;
  deleteFirestoreBox: (uid: string, boxId: string) => Promise<void>;
  deleteCropsExcept: (keep: (key: string) => boolean) => Promise<unknown>;
  storage: Storage;
  deleteSignIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

// The box in Firestore is deleted under whoever is signed in when the delete runs, not through this page's own
// saving, which may have fallen back to this browser. Only the crops this box's items use are deleted; any other
// crop is removed when the next box opens (cropSweep).
export function savedBoxDeleter(p: DeleterParts): (from?: DeleteStep) => Promise<DeleteResult> {
  return (from) => {
    const { boxId, items } = p.store.getState();
    const crops = new Set(items.flatMap((i) => (i.cropKey ? [i.cropKey] : [])));
    return deleteSavedBox(boxId, {
      stopSaving: () => p.store.close(),
      deleteBox: async (id) => {
        await p.signedIn.catch(() => {});
        const uid = p.currentUid();
        if (uid) await p.deleteFirestoreBox(uid, id);
      },
      deleteCrops: () => p.deleteCropsExcept((key) => !crops.has(key)),
      clearLocal: (id) => clearLocalBox(p.storage, id),
      deleteSignIn: p.deleteSignIn,
      signOut: p.signOut,
    }, from);
  };
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

// Another tab deleted this tab's box: its delete takes away the pointer to it (a clear of this browser's storage
// does too). Calls gone once, so this tab stops saving and reloads before it can keep anything of the old box.
export function whenDeletedElsewhere(target: Pick<Window, "addEventListener" | "removeEventListener">, boxId: string, gone: () => void): () => void {
  let told = false;
  const onStorage = (e: StorageEvent) => {
    if (told) return;
    if (e.key === null || (e.key === "byt.currentBox" && e.oldValue === boxId && e.newValue !== boxId)) {
      told = true;
      gone();
    }
  };
  target.addEventListener("storage", onStorage);
  return () => target.removeEventListener("storage", onStorage);
}
