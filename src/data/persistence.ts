// Keeps the box in Firestore (spec 5.8), so a reload or a joined phone sees the same box. The store hands
// over items with no label text; the rules refuse any that carry it. The first save creates the box with
// its owner as the only member; later saves merge only the box's contents and never send membership, so a
// phone that joined is never undone. Saves never wait: Firestore queues them, offline too.
import { collection, deleteField, doc, getDoc, getDocs, runTransaction, setDoc, writeBatch, type Firestore, type QuerySnapshot } from "firebase/firestore";
import type { BoxItem, BoxPersistence, BoxState } from "./boxStore";

export interface FirestorePersistence extends BoxPersistence {
  // Told after each save which items did not save (an empty set once they all have).
  onUnsaved(listener: (ids: ReadonlySet<string>) => void): void;
  // Resolves when every write started so far has finished; for tests and for leaving the page.
  idle(): Promise<void>;
  // The last refused or failed write, or null.
  lastError(): string | null;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Disputes = NonNullable<BoxItem["disputes"]>;

// The same JSON text for the same disputes, whatever order their keys were set in.
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

// A short revision (FNV-1a) of a value, the same whatever order its keys were set in.
export function revisionOf(value: unknown): string {
  let h = 0x811c9dc5;
  for (const ch of stableJson(value)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

// The item document: never its disputes, which are their own document.
function itemDoc(item: BoxItem): BoxItem {
  const { disputes: _disputes, ...rest } = item;
  void _disputes;
  return rest;
}

// Every saved dispute open again: what the sender settled may not be what was saved with the item.
const reopened = (d: Disputes): Disputes =>
  Object.fromEntries(Object.entries(d).map(([k, v]) => [k, { ...(v as object), resolved: false }])) as Disputes;

export function firestorePersistence(db: Firestore, uid: string, editionId: string | (() => string)): FirestorePersistence {
  const edition = () => (typeof editionId === "function" ? editionId() : editionId);
  let exists: boolean | null = null;
  let known = new Set<string>();
  // Items that have a disputes document, so one whose disputes are gone gets its document deleted.
  let knownDisputed = new Set<string>();
  const unsavedListeners = new Set<(ids: ReadonlySet<string>) => void>();
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
    // Each item and its disputes are written in one batch, so one never lands without the other. The disputes
    // are their own document (the item document never holds them) and record a revision of the item written
    // with them, so a reload can tell when the item changed since.
    const writes = s.items.map(async (i) => {
      const disputes = i.disputes !== undefined && Object.keys(i.disputes).length > 0 ? i.disputes : undefined;
      const item = itemDoc(i);
      const batch = writeBatch(db);
      batch.set(doc(box, "items", i.itemId), item);
      if (disputes) batch.set(doc(box, "disputes", i.itemId), { ...disputes, itemRev: revisionOf(item) });
      else if (knownDisputed.has(i.itemId)) batch.delete(doc(box, "disputes", i.itemId));
      await batch.commit();
      if (disputes) knownDisputed.add(i.itemId);
      else knownDisputed.delete(i.itemId);
    });
    const removals = [...known].filter((id) => !now.has(id)).map(async (id) => {
      const batch = writeBatch(db);
      batch.delete(doc(box, "items", id));
      if (knownDisputed.has(id)) batch.delete(doc(box, "disputes", id));
      await batch.commit();
      knownDisputed.delete(id);
    });
    const results = await Promise.allSettled([...writes, ...removals]);
    const failed = new Set<string>();
    s.items.forEach((i, n) => { if (results[n]?.status === "rejected") failed.add(i.itemId); });
    for (const l of unsavedListeners) l(failed);
    const firstFailure = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (firstFailure) throw firstFailure.reason;
    known = now;
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
    onUnsaved: (listener) => { unsavedListeners.add(listener); },
  };

  async function loadBox(boxId: string): Promise<Partial<BoxState> | null> {
    try {
      const snap = await getDoc(doc(db, "boxes", boxId));
      if (!snap.exists()) { exists = false; return null; }
      exists = true;
      const readBoth = () => Promise.all([getDocs(collection(db, "boxes", boxId, "items")), getDocs(collection(db, "boxes", boxId, "disputes"))]);
      let [itemDocs, disputeDocs] = await readBoth();
      // The two queries are not one snapshot: a write between them can pair an item with older disputes. Read
      // once more before holding anything.
      if (mismatched(itemDocs, disputeDocs)) [itemDocs, disputeDocs] = await readBoth();
      const disputes = new Map(disputeDocs.docs.map((d) => [d.id, d.data() as Disputes & { itemRev?: string }]));
      const items = itemDocs.docs.map((d) => paired(d.data() as BoxItem, disputes.get(d.id)));
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

// Whether any disputes document was written with a different version of its item than the one found.
function mismatched(itemDocs: QuerySnapshot, disputeDocs: QuerySnapshot): boolean {
  const revs = new Map(itemDocs.docs.map((d) => [d.id, revisionOf(d.data())]));
  return disputeDocs.docs.some((d) => (d.data() as { itemRev?: string }).itemRev !== revs.get(d.id));
}

// An item with its disputes when they were written together. When the item changed since (or the disputes
// have no item revision), the item is held at "Check this": the saved disputes come back open.
function paired(item: BoxItem, saved: (Disputes & { itemRev?: string }) | undefined): BoxItem {
  if (saved === undefined) return item;
  const { itemRev, ...facts } = saved;
  if (Object.keys(facts).length === 0) return item;
  return itemRev === revisionOf(item) ? { ...item, disputes: facts as Disputes } : { ...item, disputes: reopened(facts as Disputes) };
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
    onUnsaved: (listener) => { void target.then((p) => p.onUnsaved?.(listener)); },
    idle: () => queue.then(() => target).then((p) => ("idle" in p && typeof p.idle === "function" ? (p.idle as () => Promise<void>)() : undefined)),
  };
}
