// Keeps the box in this browser's storage so a reload keeps it, until Firestore sync lands (plan Task 22).
// The store already hands over a copy with no label text, and the result is never trusted on load: the
// store re-judges every item against the current edition.
import type { BoxOps, BoxMeta, LoadResult } from "./boxOps";
import type { BoxItem, BoxPersistence, BoxState } from "./boxStore";

const BOX_KEY = (boxId: string) => `byt.box.${boxId}`;
const CURRENT_KEY = "byt.currentBox";

type StoredBox = Partial<BoxState> & { items?: BoxItem[] };

// Runs a read-modify-write of one box under a lock all of this browser's tabs share, when the browser has one.
async function underLock<T>(name: string, f: () => T): Promise<T> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  return locks ? locks.request(name, async () => f()) : f();
}

export function localPersistence(storage: Storage): BoxPersistence & BoxOps {
  const readBox = (boxId: string): StoredBox | null => {
    const raw = storage.getItem(BOX_KEY(boxId));
    if (!raw) return null;
    try {
      const { cloudConsent: _old, ...box } = JSON.parse(raw) as StoredBox;
      void _old;
      return box;
    } catch {
      return null;
    }
  };
  // Each operation applies its one change to the box as stored now, so another tab's change is kept.
  const change = (boxId: string, f: (box: StoredBox) => StoredBox) => underLock(BOX_KEY(boxId), () => {
    const next = f(readBox(boxId) ?? { boxId, items: [] });
    try {
      storage.setItem(BOX_KEY(boxId), JSON.stringify(next));
    } catch {
      // Storage full or blocked: the box still works for this visit.
    }
  });
  return {
    async loadBox(boxId: string): Promise<LoadResult> {
      const box = readBox(boxId);
      return box ? { status: "found", box } : { status: "missing" };
    },
    putMeta: (boxId: string, meta: BoxMeta) => change(boxId, (box) => ({ ...box, boxId, ...meta })),
    putItem: (boxId: string, item: BoxItem) => change(boxId, (box) => {
      const items = box.items ?? [];
      return { ...box, items: items.some((i) => i.itemId === item.itemId) ? items.map((i) => (i.itemId === item.itemId ? item : i)) : [...items, item] };
    }),
    deleteItem: (boxId: string, itemId: string) => change(boxId, (box) => ({ ...box, items: (box.items ?? []).filter((i) => i.itemId !== itemId) })),
    save(state: BoxState) {
      const { boxId, destinationCode, items, sources } = state;
      try {
        storage.setItem(BOX_KEY(boxId), JSON.stringify({ boxId, destinationCode, items, sources }));
      } catch {
        // Storage full or blocked: the box still works for this visit.
      }
    },
    async load(boxId: string) {
      const raw = storage.getItem(BOX_KEY(boxId));
      if (!raw) return null;
      try {
        // Consent is the device's own (deviceConsent.ts); an answer an older save carried is ignored.
        const { cloudConsent: _old, ...box } = JSON.parse(raw) as Partial<BoxState>;
        void _old;
        return box;
      } catch {
        return null;
      }
    },
  };
}

export function currentBoxId(storage: Storage, newId: () => string): string {
  const known = storage.getItem(CURRENT_KEY);
  if (known) return known;
  const id = newId();
  try { storage.setItem(CURRENT_KEY, id); } catch { /* the id lasts for this visit */ }
  return id;
}
