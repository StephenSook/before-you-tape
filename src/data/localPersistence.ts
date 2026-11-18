// Keeps the box in this browser's storage so a reload keeps it, until Firestore sync lands (plan Task 22).
// The store already hands over a copy with no label text, and the result is never trusted on load: the
// store re-judges every item against the current edition.
import type { BoxPersistence, BoxState } from "./boxStore";

const BOX_KEY = (boxId: string) => `byt.box.${boxId}`;
// Consent lives apart from the box, so a save from a tab holding an old answer cannot write it back.
const CONSENT_KEY = (boxId: string) => `byt.consent.${boxId}`;
const CURRENT_KEY = "byt.currentBox";

export function localPersistence(storage: Storage): BoxPersistence {
  return {
    save(state: BoxState) {
      const { boxId, destinationCode, items, sources } = state;
      try {
        storage.setItem(BOX_KEY(boxId), JSON.stringify({ boxId, destinationCode, items, sources }));
      } catch {
        // Storage full or blocked: the box still works for this visit.
      }
    },
    saveConsent(boxId: string, consent: boolean | null) {
      try {
        storage.setItem(CONSENT_KEY(boxId), JSON.stringify(consent));
      } catch {
        // Storage full or blocked: the answer holds for this visit.
      }
    },
    async load(boxId: string) {
      const raw = storage.getItem(BOX_KEY(boxId));
      if (!raw) return null;
      try {
        const box = JSON.parse(raw) as Partial<BoxState>;
        // A box saved before consent had its own key keeps the answer it carried.
        const saved = storage.getItem(CONSENT_KEY(boxId));
        if (saved === null) return box;
        const consent: unknown = JSON.parse(saved);
        return { ...box, cloudConsent: consent === true || consent === false ? consent : null };
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
