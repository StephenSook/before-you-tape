// Keeps the box in Firestore (spec 5.8), so a reload or a joined phone sees the same box. The store hands
// over items with no label text; the rules refuse any that carry it. The first save creates the box with
// its owner as the only member; later saves merge only the box's contents and never send membership, so a
// phone that joined is never undone. Saves never wait: Firestore queues them, offline too.
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, runTransaction, setDoc, type Firestore } from "firebase/firestore";
import type { BoxItem, BoxPersistence, BoxState } from "./boxStore";

export interface FirestorePersistence extends BoxPersistence {
  // Resolves when every write started so far has finished; for tests and for leaving the page.
  idle(): Promise<void>;
  // The last refused or failed write, or null.
  lastError(): string | null;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function withoutDisputes(item: BoxItem): BoxItem {
  const { disputes: _disputes, ...rest } = item;
  void _disputes;
  return rest;
}

export function firestorePersistence(db: Firestore, uid: string, editionId: string | (() => string)): FirestorePersistence {
  const edition = () => (typeof editionId === "function" ? editionId() : editionId);
  let exists: boolean | null = null;
  let known = new Set<string>();
  // Items that have a disputes document, so one whose disputes are gone gets its document deleted.
  let knownDisputed = new Set<string>();
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
    // Firestore holds no consent: each device keeps its own answer. A merge deletes the answer an older
    // version of the app saved on the box.
    const content = { destinationCode: s.destinationCode, editionId: edition(), sources: s.sources, lastRecheckMs: s.lastRecheckMs };
    const merge = { ...content, cloudConsent: deleteField() };
    if (exists !== true) {
      // Create or merge in one transaction, so two tabs that both saw no box never overwrite each other.
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(box);
        if (snap.exists()) tx.set(box, merge, { merge: true });
        else tx.set(box, { ownerUid: uid, memberUids: [uid], joinKeyHash: "", ...content });
      });
      exists = true;
    } else {
      await setDoc(box, merge, { merge: true });
    }
    const now = new Set(s.items.map((i) => i.itemId));
    // A second look's disputes are their own document, beside the item: the item document never holds them.
    const disputed = s.items.filter((i) => i.disputes !== undefined && Object.keys(i.disputes).length > 0);
    const nowDisputed = new Set(disputed.map((i) => i.itemId));
    await Promise.all([
      ...s.items.map((i) => setDoc(doc(box, "items", i.itemId), withoutDisputes(i))),
      ...disputed.map((i) => setDoc(doc(box, "disputes", i.itemId), i.disputes!)),
      ...[...known].filter((id) => !now.has(id)).map((id) => deleteDoc(doc(box, "items", id))),
      ...[...knownDisputed].filter((id) => !nowDisputed.has(id)).map((id) => deleteDoc(doc(box, "disputes", id))),
    ]);
    known = now;
    knownDisputed = nowDisputed;
  };

  return {
    save(state) {
      queue = queue.then(() => write(state)).then(() => { error = null; }, (e: unknown) => { error = message(e); });
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
      const [itemDocs, disputeDocs] = await Promise.all([
        getDocs(collection(db, "boxes", boxId, "items")), getDocs(collection(db, "boxes", boxId, "disputes")),
      ]);
      const disputes = new Map(disputeDocs.docs.map((d) => [d.id, d.data() as NonNullable<BoxItem["disputes"]>]));
      const items = itemDocs.docs.map((d) => {
        const i = d.data() as BoxItem;
        const found = disputes.get(i.itemId);
        return found ? { ...i, disputes: found } : i;
      });
      known = new Set(items.map((i) => i.itemId));
      knownDisputed = new Set([...disputes.keys()]);
      const d = snap.data() as Partial<BoxState>;
      return { boxId, destinationCode: d.destinationCode, sources: d.sources, items };
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
    load: (boxId) => target.then((p) => p.load(boxId)),
    idle: () => queue.then(() => target).then((p) => ("idle" in p && typeof p.idle === "function" ? (p.idle as () => Promise<void>)() : undefined)),
  };
}
