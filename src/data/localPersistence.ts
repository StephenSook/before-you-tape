// Keeps the box in this browser's storage so a reload keeps it, until Firestore sync lands (plan Task 22).
// The store already hands over a copy with no label text, and the result is never trusted on load: the
// store re-judges every item against the current edition.
import type { BoxPersistence, BoxState } from "./boxStore";

const BOX_KEY = (boxId: string) => `byt.box.${boxId}`;
const CURRENT_KEY = "byt.currentBox";

export function localPersistence(storage: Storage): BoxPersistence {
  return {
    save(state: BoxState) {
      const { boxId, destinationCode, items, cloudConsent, sources } = state;
      try {
        storage.setItem(BOX_KEY(boxId), JSON.stringify({ boxId, destinationCode, items, cloudConsent, sources }));
      } catch {
        // Storage full or blocked: the box still works for this visit.
      }
    },
    async load(boxId: string) {
      const raw = storage.getItem(BOX_KEY(boxId));
      if (!raw) return null;
      try {
        return JSON.parse(raw) as Partial<BoxState>;
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
