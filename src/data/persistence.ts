// Keeps the box in Firestore (spec 5.8), so a reload or a joined phone sees the same box. The store hands
// over items with no label text; the rules refuse any that carry it. The first save creates the box with
// its owner as the only member; later saves merge only the box's contents and never send membership, so a
// phone that joined is never undone. Saves never wait: Firestore queues them, offline too.
import { collection, deleteDoc, doc, getDoc, getDocFromServer, getDocs, runTransaction, serverTimestamp, setDoc, type Firestore } from "firebase/firestore";
import type { BoxItem, BoxPersistence, BoxState } from "./boxStore";

export interface FirestorePersistence extends BoxPersistence {
  // Resolves when every write started so far has finished; for tests and for leaving the page.
  idle(): Promise<void>;
  // The last refused or failed write, or null.
  lastError(): string | null;
  saveConsent(boxId: string, consent: boolean | null, chosenAt: number): void;
  readConsent(boxId: string): Promise<boolean | null | undefined>;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function firestorePersistence(db: Firestore, uid: string, editionId: string | (() => string)): FirestorePersistence {
  const edition = () => (typeof editionId === "function" ? editionId() : editionId);
  let exists: boolean | null = null;
  let known = new Set<string>();
  let queue: Promise<void> = Promise.resolve();
  let error: string | null = null;
  let loading: Promise<unknown> | null = null;

  const write = async (s: BoxState) => {
    const box = doc(db, "boxes", s.boxId);
    // The store saves as soon as it starts, often before its load has answered. A write must know whether
    // the box exists (a new box is created with its owner; an existing one gets only its contents), so it
    // waits for the load, or checks for itself when no load was made.
    if (loading) await loading;
    if (exists === null) {
      const snap = await getDoc(box).catch(() => null);
      if (snap) exists = snap.exists();
    }
    // Consent is never part of a save: a new box starts with no answer, and only saveConsent changes it.
    const content = { destinationCode: s.destinationCode, editionId: edition(), sources: s.sources, lastRecheckMs: s.lastRecheckMs };
    if (exists !== true) {
      // Create or merge in one transaction, so two tabs that both saw no box never overwrite each other.
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(box);
        if (snap.exists()) tx.set(box, content, { merge: true });
        else tx.set(box, { ownerUid: uid, memberUids: [uid], joinKeyHash: "", cloudConsent: null, ...content });
      });
      exists = true;
    } else {
      await setDoc(box, content, { merge: true });
    }
    const now = new Set(s.items.map((i) => i.itemId));
    await Promise.all([
      ...s.items.map((i) => setDoc(doc(box, "items", i.itemId), i)),
      ...[...known].filter((id) => !now.has(id)).map((id) => deleteDoc(doc(box, "items", id))),
    ]);
    known = now;
  };

  return {
    save(state) {
      queue = queue.then(() => write(state)).then(() => { error = null; }, (e: unknown) => { error = message(e); });
    },
    // The press time orders presses across tabs: the rules refuse one older than the stored answer, and the
    // server stamps when it took the change.
    saveConsent(boxId, consent, chosenAt) {
      queue = queue.then(async () => {
        if (loading) await loading;
        await setDoc(doc(db, "boxes", boxId), { cloudConsent: consent, consentChosenAt: chosenAt, consentAt: serverTimestamp() }, { merge: true });
      }).then(() => { error = null; }, (e: unknown) => { error = message(e); });
    },
    // The answer as the server has it now, after this tab's own writes: true, false or null, or undefined
    // when the server cannot be read (offline, refused), which keeps the cloud closed.
    readConsent(boxId) {
      return queue.then(async () => {
        const snap = await getDocFromServer(doc(db, "boxes", boxId));
        if (!snap.exists()) return undefined;
        const v = (snap.data() as { cloudConsent?: unknown }).cloudConsent;
        return v === true || v === false ? v : null;
      }).catch(() => undefined);
    },
    load(boxId) {
      const run = loadBox(boxId);
      loading = run;
      return run;
    },
    idle: () => queue,
    lastError: () => error,
  };

  async function loadBox(boxId: string): Promise<Partial<BoxState> | null> {
    try {
      const snap = await getDoc(doc(db, "boxes", boxId));
      if (!snap.exists()) { exists = false; return null; }
      exists = true;
      const items = (await getDocs(collection(db, "boxes", boxId, "items"))).docs.map((d) => d.data() as BoxItem);
      known = new Set(items.map((i) => i.itemId));
      const d = snap.data() as Partial<BoxState>;
      return { boxId, destinationCode: d.destinationCode, cloudConsent: d.cloudConsent, sources: d.sources, items };
    } catch (e) {
      // Not a member, or offline with nothing cached: there is no box to load.
      error = message(e);
      return null;
    }
  }
}

// Firestore needs a signed-in user. Until sign-in finishes, saves wait in order; if it fails (offline on a
// first visit), the box stays in this browser's storage instead.
export function persistenceAfterSignIn(
  signIn: Promise<string>, make: (uid: string) => BoxPersistence, fallback: BoxPersistence,
): BoxPersistence & { idle(): Promise<void> } {
  const target = signIn.then(make, () => fallback);
  let queue: Promise<void> = Promise.resolve();
  return {
    save(state) {
      queue = queue.then(() => target).then((p) => p.save(state));
    },
    saveConsent(boxId, consent, chosenAt) {
      queue = queue.then(() => target).then((p) => p.saveConsent?.(boxId, consent, chosenAt));
    },
    readConsent: (boxId) => queue.then(() => target).then((p) => (p.readConsent ? p.readConsent(boxId) : undefined)),
    load: (boxId) => target.then((p) => p.load(boxId)),
    idle: () => queue.then(() => target).then((p) => ("idle" in p && typeof p.idle === "function" ? (p.idle as () => Promise<void>)() : undefined)),
  };
}
