// Keeps the box in Firestore (spec 5.8), so a reload or a joined phone sees the same box. The store hands
// over items with no label text; the rules refuse any that carry it. Each operation changes only what it
// names: the box's details (created with its owner as the only member, then merged without membership, so a
// phone that joined is never undone), one item with its disputes, or one item's removal.
import { collection, deleteField, doc, getDoc, getDocs, runTransaction, writeBatch, type Firestore, type QuerySnapshot } from "firebase/firestore";
import { stableJson, type BoxMeta, type BoxOps, type LoadResult } from "./boxOps";
import type { BoxItem, BoxState } from "./boxStore";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Disputes = NonNullable<BoxItem["disputes"]>;

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

export function firestorePersistence(db: Firestore, uid: string, editionId: string | (() => string)): BoxOps {
  const edition = () => (typeof editionId === "function" ? editionId() : editionId);

  // The box's items, each with its disputes when they were written together (else reopened).
  const readItems = async (boxId: string, d: Partial<BoxState>): Promise<Partial<BoxState>> => {
    const readBoth = () => Promise.all([getDocs(collection(db, "boxes", boxId, "items")), getDocs(collection(db, "boxes", boxId, "disputes"))]);
    let [itemDocs, disputeDocs] = await readBoth();
    // The two queries are not one snapshot: a write between them can pair an item with older disputes. Read
    // once more before holding anything.
    if (mismatched(itemDocs, disputeDocs)) [itemDocs, disputeDocs] = await readBoth();
    const disputes = new Map(disputeDocs.docs.map((x) => [x.id, x.data() as Disputes & { itemRev?: string }]));
    const items = itemDocs.docs.map((x) => paired(x.data() as BoxItem, disputes.get(x.id)));
    return { boxId, destinationCode: d.destinationCode, sources: d.sources, lastRecheckMs: d.lastRecheckMs ?? null, items };
  };

  return {
    async loadBox(boxId: string): Promise<LoadResult> {
      try {
        const snap = await getDoc(doc(db, "boxes", boxId));
        if (!snap.exists()) return { status: "missing" };
        return { status: "found", box: await readItems(boxId, snap.data() as Partial<BoxState>) };
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
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(box);
        if (snap.exists()) tx.set(box, { ...content, cloudConsent: deleteField() }, { merge: true });
        else tx.set(box, { ownerUid: uid, memberUids: [uid], joinKeyHash: "", ...content });
      });
    },
    // One item and its disputes in one batch; with no disputes, any old disputes document goes.
    async putItem(boxId: string, item: BoxItem) {
      const box = doc(db, "boxes", boxId);
      const disputes = item.disputes !== undefined && Object.keys(item.disputes).length > 0 ? item.disputes : undefined;
      const written = itemDoc(item);
      const batch = writeBatch(db);
      batch.set(doc(box, "items", item.itemId), written);
      if (disputes) batch.set(doc(box, "disputes", item.itemId), { ...disputes, itemRev: revisionOf(written) });
      else batch.delete(doc(box, "disputes", item.itemId));
      await batch.commit();
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

// Firestore needs a signed-in user. Until sign-in finishes, operations wait in order; if it fails (offline on a
// first visit), the box is kept in this browser's storage instead. The store keeps its own journal of what has not
// reached the server, so a later visit that signs in sends it.
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
