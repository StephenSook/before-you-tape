// Keeps the box in Firestore (spec 5.8), so a reload or a joined phone sees the same box. The store hands
// over items with no label text; the rules refuse any that carry it. The first save creates the box with
// its owner as the only member; later saves merge only the box's contents and never send membership, so a
// phone that joined is never undone. Saves never wait: Firestore queues them, offline too.
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, type Firestore } from "firebase/firestore";
import type { BoxItem, BoxPersistence, BoxState } from "./boxStore";

export interface FirestorePersistence extends BoxPersistence {
  // Resolves when every write started so far has finished; for tests and for leaving the page.
  idle(): Promise<void>;
  // The last refused or failed write, or null.
  lastError(): string | null;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function firestorePersistence(db: Firestore, uid: string, editionId: string): FirestorePersistence {
  let exists: boolean | null = null;
  let known = new Set<string>();
  let queue: Promise<void> = Promise.resolve();
  let error: string | null = null;

  const write = async (s: BoxState) => {
    const box = doc(db, "boxes", s.boxId);
    const content = { destinationCode: s.destinationCode, editionId, cloudConsent: s.cloudConsent, sources: s.sources, lastRecheckMs: s.lastRecheckMs };
    if (exists === false) {
      await setDoc(box, { ownerUid: uid, memberUids: [uid], joinKeyHash: "", ...content });
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
    async load(boxId) {
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
    },
    idle: () => queue,
    lastError: () => error,
  };
}
