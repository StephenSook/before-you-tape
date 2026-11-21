// Keeps the box in Firestore (spec 5.8), so a reload or a joined phone sees the same box. The store hands
// over items with no label text; the rules refuse any that carry it. Each operation changes only what it
// names: the box's details (created with its owner as the only member, then merged without membership, so a
// phone that joined is never undone), one item with its disputes, or one item's removal.
// A box lasts 37 days from its creation: its anonymous owner may be removed after 30, and Firestore's TTL policy
// on expiresAt deletes the box, its items and its disputes. Items and disputes carry the box's own expiry. The
// items the app holds never carry it, so revisions, and the disputes they pair, do not depend on it.
import { collection, deleteField, doc, getDoc, getDocFromServer, getDocs, getDocsFromServer, runTransaction, setDoc, Timestamp, writeBatch, type DocumentSnapshot, type Firestore, type QuerySnapshot } from "firebase/firestore";
import { stableJson, type BoxMeta, type BoxOps, type LoadResult } from "./boxOps";
import type { BoxItem, BoxState } from "./boxStore";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Disputes = NonNullable<BoxItem["disputes"]>;

export const BOX_DAYS = 37;
const DAY_MS = 86_400_000;

// A stored document without its expiry.
function unexpired<T>(d: T): T {
  if (d === null || typeof d !== "object" || !("expiresAt" in d)) return d;
  const { expiresAt: _e, ...rest } = d as Record<string, unknown>;
  void _e;
  return rest as T;
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

export function firestorePersistence(db: Firestore, uid: string, editionId: string | (() => string), now: () => number = () => Date.now()): BoxOps & Required<Pick<BoxOps, "deleteBox">> {
  const edition = () => (typeof editionId === "function" ? editionId() : editionId);
  // Each box's expiry as last created, read or loaded here: null for a box from before expiry.
  const expiries = new Map<string, Timestamp | null>();
  // A box this user cannot read is not remembered: the write then goes without an expiry, and the rules refuse it.
  const expiryOf = async (boxId: string): Promise<Timestamp | null> => {
    if (!expiries.has(boxId)) {
      try {
        const snap = await getDoc(doc(db, "boxes", boxId));
        expiries.set(boxId, (snap.data()?.expiresAt as Timestamp | undefined) ?? null);
      } catch {
        return null;
      }
    }
    return expiries.get(boxId) ?? null;
  };
  const withExpiry = <T extends object>(d: T, expiresAt: Timestamp | null) => (expiresAt ? { ...d, expiresAt } : d);

  // The box's items, each with its disputes when they were written together (else reopened).
  const readItems = async (boxId: string, d: Partial<BoxState>): Promise<Partial<BoxState>> => {
    const readBoth = () => Promise.all([getDocs(collection(db, "boxes", boxId, "items")), getDocs(collection(db, "boxes", boxId, "disputes"))]);
    let [itemDocs, disputeDocs] = await readBoth();
    // The two queries are not one snapshot: a write between them can pair an item with older disputes. Read
    // once more before holding anything.
    if (mismatched(itemDocs, disputeDocs)) [itemDocs, disputeDocs] = await readBoth();
    const disputes = new Map(disputeDocs.docs.map((x) => [x.id, unexpired(x.data()) as Disputes & { itemRev?: string }]));
    const items = itemDocs.docs.map((x) => paired(unexpired(x.data()) as BoxItem, disputes.get(x.id)));
    return { boxId, destinationCode: d.destinationCode, sources: d.sources, lastRecheckMs: d.lastRecheckMs ?? null, items };
  };

  return {
    async loadBox(boxId: string): Promise<LoadResult> {
      try {
        const snap = await getDoc(doc(db, "boxes", boxId));
        if (!snap.exists()) return { status: "missing" };
        expiries.set(boxId, (snap.data().expiresAt as Timestamp | undefined) ?? null);
        return { status: "found", box: await readItems(boxId, unexpired(snap.data()) as Partial<BoxState>) };
      } catch (e) {
        // Not a member, offline with nothing cached, or a query that failed: never an empty box.
        return { status: "failed", error: message(e) };
      }
    },
    // Create or merge in one transaction, so two tabs that both saw no box never overwrite each other.
    // Firestore holds no consent: each device keeps its own answer, and a merge deletes one an older app saved.
    async putMeta(boxId: string, meta: BoxMeta) {
      const box = doc(db, "boxes", boxId);
      const content = { ...meta, editionId: edition() };
      const created = Timestamp.fromMillis(now() + BOX_DAYS * DAY_MS);
      const expiresAt = await runTransaction(db, async (tx) => {
        const snap = await tx.get(box);
        if (snap.exists()) {
          tx.set(box, { ...content, cloudConsent: deleteField() }, { merge: true });
          return (snap.data().expiresAt as Timestamp | undefined) ?? null;
        }
        tx.set(box, { ownerUid: uid, memberUids: [uid], joinKeyHash: "", ...content, expiresAt: created });
        return created;
      });
      expiries.set(boxId, expiresAt);
    },
    // One item and its disputes in one batch; with no disputes, any old disputes document goes.
    async putItem(boxId: string, item: BoxItem) {
      const box = doc(db, "boxes", boxId);
      const disputes = item.disputes !== undefined && Object.keys(item.disputes).length > 0 ? item.disputes : undefined;
      const written = itemDoc(item);
      const expiresAt = await expiryOf(boxId);
      const batch = writeBatch(db);
      batch.set(doc(box, "items", item.itemId), withExpiry(written, expiresAt));
      if (disputes) batch.set(doc(box, "disputes", item.itemId), withExpiry({ ...disputes, itemRev: revisionOf(written) }, expiresAt));
      else batch.delete(doc(box, "disputes", item.itemId));
      await batch.commit();
    },
    // Its items and disputes first, in batches, then the box with its tombstone in one batch, so the id is retired
    // and no one could start it again to reach anything left behind. The rules let only the owner do this.
    // Every read here is from the server, never this browser's cache: a cached "no items left" would let the box be
    // deleted over items another tab saved, and offline the delete fails at once instead of waiting to land later.
    async deleteBox(boxId: string) {
      const box = doc(db, "boxes", boxId);
      let snap: DocumentSnapshot | null = null;
      await deleteOrRetire(
        async () => (snap = await getDocFromServer(box)).exists(),
        async () => {
          const data = snap!.data()!;
          // A member who is not the owner may delete items, so the check comes before any of them is touched.
          if (data.ownerUid !== uid) throw new Error("only the box's owner can delete it");
          const expiresAt = (data.expiresAt as Timestamp | undefined) ?? null;
          // Its tombstone takes its time from the box's expiry; without one the last batch would be refused after the
          // items were gone, so it is refused here, first. Every box has one since the backfill.
          if (!expiresAt) throw new Error("this box has no expiry, so it cannot be retired");
          await sweepUntilEmpty(
            async () => {
              const [items, disputes] = await Promise.all([getDocsFromServer(collection(box, "items")), getDocsFromServer(collection(box, "disputes"))]);
              return [...items.docs, ...disputes.docs].map((d) => d.ref);
            },
            async (refs) => {
              const batch = writeBatch(db);
              for (const ref of refs) batch.delete(ref);
              await batch.commit();
            },
          );
          const last = writeBatch(db);
          // The tombstone outlives the box by 30 days, so TTL removes anything the box left behind first.
          last.set(doc(db, "retiredBoxes", boxId), { expiresAt: Timestamp.fromMillis(expiresAt.toMillis() + 30 * DAY_MS) });
          last.delete(box);
          await last.commit();
        },
        // Retired anyway, so a first save still on its way from another tab cannot create the box after this.
        () => setDoc(doc(db, "retiredBoxes", boxId), { expiresAt: Timestamp.fromMillis(now() + (BOX_DAYS + 30) * DAY_MS) }),
      );
      expiries.delete(boxId);
    },
    async deleteItem(boxId: string, itemId: string) {
      const box = doc(db, "boxes", boxId);
      const batch = writeBatch(db);
      batch.delete(doc(box, "items", itemId));
      batch.delete(doc(box, "disputes", itemId));
      await batch.commit();
    },
  };
}

// Whether any disputes document was written with a different version of its item than the one found.
function mismatched(itemDocs: QuerySnapshot, disputeDocs: QuerySnapshot): boolean {
  const revs = new Map(itemDocs.docs.map((d) => [d.id, revisionOf(unexpired(d.data()))]));
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

// Firestore needs a signed-in user. Until sign-in finishes, operations wait in order; if it fails (offline on a
// first visit), the box is kept in this browser's storage instead. The store keeps its own journal of what has not
// reached the server, so a later visit that signs in sends it.
// Deletes a box that is there, and retires the id of one that is not. A refused retire means the id was retired
// already, or another tab's first save created the box since the read (a tombstone is refused while its box exists),
// so the box is read once more and deleted if it is there now.
export async function deleteOrRetire(exists: () => Promise<boolean>, deleteExisting: () => Promise<void>, retire: () => Promise<void>): Promise<void> {
  if (await exists()) return deleteExisting();
  try {
    await retire();
  } catch (e) {
    if ((e as { code?: unknown } | null)?.code !== "permission-denied") throw e;
    if (await exists()) await deleteExisting();
  }
}

// Lists and deletes, in batches of 400, until a list comes back empty, so an item another tab saved while the first
// batches ran is deleted too. After `rounds` lists that each found more it stops, and the box is not deleted.
export async function sweepUntilEmpty<T>(list: () => Promise<T[]>, remove: (batch: T[]) => Promise<void>, rounds = 5): Promise<void> {
  for (let r = 0; r < rounds; r++) {
    const found = await list();
    if (found.length === 0) return;
    for (let i = 0; i < found.length; i += 400) await remove(found.slice(i, i + 400));
  }
  throw new Error("the box kept getting new items while it was being deleted");
}

export function persistenceAfterSignIn(signIn: Promise<string>, make: (uid: string) => BoxOps, fallback: BoxOps): BoxOps {
  let local = false;
  const target = signIn.then(make, () => { local = true; return fallback; });
  return {
    localOnly: () => local,
    loadBox: (boxId) => target.then((p) => p.loadBox(boxId)),
    putMeta: (boxId, meta) => target.then((p) => p.putMeta(boxId, meta)),
    putItem: (boxId, item) => target.then((p) => p.putItem(boxId, item)),
    deleteItem: (boxId, itemId) => target.then((p) => p.deleteItem(boxId, itemId)),
  };
}
