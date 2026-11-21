// "Delete my saved box" on the web: this page stops saving, then the box in Firestore (its items, disputes and the
// box, with a tombstone), this device's crops, the anonymous sign-in, and last this browser's box keys. Each step
// must finish before the next; the first that fails stops the rest and is named, so the sender knows what is left,
// and a retry starts there. The keys go last because taking away the pointer to the box tells other tabs to start
// again (whenDeletedElsewhere), which must wait until the sign-in is gone, or they would save a new box under it.
export type DeleteStep = "box" | "crops" | "signIn";
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

const STEPS: DeleteStep[] = ["box", "crops", "signIn"];

export async function deleteSavedBox(boxId: string, d: DeleteSavedBoxDeps, from: DeleteStep = "box"): Promise<DeleteResult> {
  const runs = (step: DeleteStep) => STEPS.indexOf(step) >= STEPS.indexOf(from);
  if (runs("box")) {
    try { await d.stopSaving(); await d.deleteBox(boxId); } catch { return { ok: false, stoppedAt: "box" }; }
  }
  if (runs("crops")) {
    try { await d.deleteCrops(); } catch { return { ok: false, stoppedAt: "crops" }; }
  }
  let signIn: "deleted" | "signed_out" = "deleted";
  try {
    await d.deleteSignIn();
  } catch (e) {
    // An old anonymous session cannot sign in again to prove itself, so it is signed out instead; Firebase removes
    // unused anonymous sign-ins on its own.
    if ((e as { code?: unknown } | null)?.code !== "auth/requires-recent-login") return { ok: false, stoppedAt: "signIn" };
    try { await d.signOut(); } catch { return { ok: false, stoppedAt: "signIn" }; }
    signIn = "signed_out";
  }
  // Storage this browser refuses holds nothing of the box to remove.
  try { d.clearLocal(boxId); } catch { /* nothing was kept */ }
  return { ok: true, signIn };
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
  store: { getState(): { boxId: string }; close(): Promise<void> };
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
// saving, which may have fallen back to this browser. Every crop on this device goes: no other box can start here
// before the delete ends (the pointer goes last), so each is this box's, a photo another tab added since included.
export function savedBoxDeleter(p: DeleterParts): (from?: DeleteStep) => Promise<DeleteResult> {
  return (from) => {
    return deleteSavedBox(p.store.getState().boxId, {
      stopSaving: () => p.store.close(),
      deleteBox: async (id) => {
        await p.signedIn.catch(() => {});
        const uid = p.currentUid();
        if (uid) await p.deleteFirestoreBox(uid, id);
      },
      deleteCrops: () => p.deleteCropsExcept(() => false),
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
