// "Delete my saved box" on the web: this page stops saving, then the box in Firestore (its items, disputes and the
// box, with a tombstone), this device's crops, the anonymous sign-in, and last this browser's box keys. Each step
// must finish before the next; the first that fails stops the rest and is named, so the sender knows what is left,
// and a retry starts there. The keys go last because taking away the pointer to the box tells other tabs to start
// again (whenDeletedElsewhere), which must wait until the sign-in is gone, or they would save a new box under it.
import { forgetTypedDrafts } from "./typedDrafts";
import { NotBoxOwner, type BoxGone } from "./boxOps";

export type DeleteStep = "box" | "crops" | "signIn";
// kept: the sign-in was not this box's to delete (another tab signed in since, or no box was in Firestore for it).
export type SignInOutcome = "deleted" | "signed_out" | "kept";
// offline: the delete could not reach the box as its owner (offline, no Firebase session, or another owner's box), so
// nothing was changed.
export type DeleteResult = { ok: true; signIn: SignInOutcome } | { ok: false; stoppedAt: DeleteStep } | { ok: false; offline: true };

export interface DeleteSavedBoxDeps {
  // Resolves once this page's writes already out have answered; nothing more is kept or sent.
  stopSaving(): Promise<void>;
  // The box step failed, so the box is still there: this page keeps and sends its edits again.
  resumeSaving(): void;
  // Says whose the box was and which crops its items used.
  deleteBox(boxId: string): Promise<BoxGone>;
  deleteCrops(keys: string[]): Promise<unknown>;
  currentUid(): string | null;
  clearLocal(boxId: string): void;
  deleteSignIn(): Promise<void>;
  signOut(): Promise<void>;
}

const STEPS: DeleteStep[] = ["box", "crops", "signIn"];

// known: on a retry that starts after the box step, what that step found.
export async function deleteSavedBox(boxId: string, d: DeleteSavedBoxDeps, from: DeleteStep = "box", known?: BoxGone): Promise<DeleteResult> {
  const runs = (step: DeleteStep) => STEPS.indexOf(step) >= STEPS.indexOf(from);
  let gone: BoxGone | null = known ?? null;
  if (runs("box")) {
    try {
      await d.stopSaving();
      gone = await d.deleteBox(boxId);
    } catch (e) {
      d.resumeSaving();
      // Checked before anything of the box is touched, so nothing was changed.
      return e instanceof NotBoxOwner ? { ok: false, offline: true } : { ok: false, stoppedAt: "box" };
    }
  }
  if (runs("crops")) {
    try { await d.deleteCrops(gone?.cropKeys ?? []); } catch { return { ok: false, stoppedAt: "crops" }; }
  }
  // Only the sign-in that owned this box goes: another tab may have signed in since as the owner of a newer box.
  let signIn: SignInOutcome = "kept";
  if (gone?.ownerUid && d.currentUid() === gone.ownerUid) {
    try {
      await d.deleteSignIn();
      signIn = "deleted";
    } catch (e) {
      // An old anonymous session cannot sign in again to prove itself, so it is signed out instead; Firebase removes
      // unused anonymous sign-ins on its own.
      if ((e as { code?: unknown } | null)?.code !== "auth/requires-recent-login") return { ok: false, stoppedAt: "signIn" };
      try { await d.signOut(); } catch { return { ok: false, stoppedAt: "signIn" }; }
      signIn = "signed_out";
    }
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
  store: { getState(): { boxId: string; items: ReadonlyArray<{ cropKey: string | null }> }; close(): Promise<void>; reopen(): void };
  // Settles once this page's own sign-in has finished, whether it worked or not.
  signedIn: Promise<unknown>;
  // Whoever is signed in now: another tab may have signed in after this page's own sign-in failed.
  currentUid: () => string | null;
  deleteFirestoreBox: (uid: string, boxId: string) => Promise<BoxGone>;
  deleteCrop: (key: string) => Promise<unknown>;
  storage: Storage;
  // This tab's session storage, which keeps an item still being typed; its drafts go with the box.
  session?: Pick<Storage, "length" | "key" | "removeItem">;
  deleteSignIn: () => Promise<void>;
  signOut: () => Promise<void>;
  // This tab still holds a box another tab deleted (the pointer names another box): it leaves it and starts again.
  onStale: () => void;
  // Whether the browser says it is online.
  online: () => boolean;
}

// The box in Firestore is deleted under whoever is signed in when the delete runs, not through this page's own
// saving, which may have fallen back to this browser. Only this box's crops go, never every crop on the device:
// those its items use on this page, and those its items in Firestore used, another tab's included.
export function savedBoxDeleter(p: DeleterParts): (from?: DeleteStep) => Promise<DeleteResult> {
  // What the box step found, for a retry that starts after it.
  let found: BoxGone | undefined;
  return (from) => {
    const boxId = p.store.getState().boxId;
    // A tab that missed another tab's delete still holds the old box; deleting from it would delete the crops and the
    // sign-in of the box started since, so it deletes nothing and leaves the old box instead.
    let pointer: string | null = null;
    try { pointer = p.storage.getItem("byt.currentBox"); } catch { /* this browser keeps no pointer */ }
    if (pointer !== null && pointer !== boxId) {
      p.onStale();
      return Promise.resolve({ ok: false, stoppedAt: "box" });
    }
    const here = p.store.getState().items.flatMap((i) => (i.cropKey ? [i.cropKey] : []));
    return (async (): Promise<DeleteResult> => {
      // A delete it cannot confirm is never claimed: offline, or with no Firebase session, nothing is touched.
      await p.signedIn.catch(() => {});
      if (!p.online() || !p.currentUid()) return { ok: false, offline: true };
      return deleteSavedBox(boxId, {
        stopSaving: () => p.store.close(),
        resumeSaving: () => p.store.reopen(),
        deleteBox: async (id) => {
          const uid = p.currentUid();
          if (!uid) throw new NotBoxOwner();
          found = await p.deleteFirestoreBox(uid, id);
          return found;
        },
        deleteCrops: async (keys) => { for (const key of new Set([...here, ...keys])) await p.deleteCrop(key); },
        currentUid: p.currentUid,
        clearLocal: (id) => {
          clearLocalBox(p.storage, id);
          if (p.session) forgetTypedDrafts(p.session);
        },
        deleteSignIn: p.deleteSignIn,
        signOut: p.signOut,
      }, from, found);
    })();
  };
}

// A delete ends by reloading the page onto a new, empty box; this keeps how the sign-in went for that page to say once.
const DELETED_KEY = "byt.deleted";

export function rememberDeleted(storage: Storage, signIn: SignInOutcome): void {
  try { storage.setItem(DELETED_KEY, signIn); } catch { /* the notice is a courtesy */ }
}

export function takeDeletedNotice(storage: Storage): SignInOutcome | null {
  try {
    const v = storage.getItem(DELETED_KEY);
    storage.removeItem(DELETED_KEY);
    return v === "deleted" || v === "signed_out" || v === "kept" ? v : null;
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

// In a tab whose box another tab deleted: stop saving, remove anything of the box a write still on its way put back
// in this browser once that write has answered, then start again on a new box.
export async function leaveDeletedBox(store: { close(): Promise<void> }, storage: Storage, boxId: string, reload: () => void,
  session?: Pick<Storage, "length" | "key" | "removeItem">): Promise<void> {
  await store.close();
  try { clearLocalBox(storage, boxId); } catch { /* storage this browser refuses holds nothing */ }
  try { if (session) forgetTypedDrafts(session); } catch { /* nothing was kept */ }
  reload();
}
