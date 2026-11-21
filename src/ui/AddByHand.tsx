// The sender types an item instead of showing it. It counts as typed by the sender, never as a model read. An item
// still being typed is kept in this tab's session storage, so a reload (for a new version, or any other) brings it
// back; it is forgotten once added.
import { useState } from "react";
import { RETAIL_BOX_VALUES, type ItemRead } from "../shared/itemRead";
import { CATEGORY_LABELS } from "./categoryLabels";
import { draftOf, FLAG_FIELDS, NUMBER_FIELDS, numbersValid, parseNumber, ReadFields, type ReadDraft } from "./ReadFields";

export function readFromDraft(d: ReadDraft): ItemRead | null {
  if (d.category === "" || !numbersValid(d)) return null;
  const read = {
    itemName: d.itemName.trim() || CATEGORY_LABELS[d.category],
    category: d.category,
    labelText: d.labelText.trim(),
    retailBox: d.retailBox,
    // Typed label words count as a read label; otherwise the sender only says what it is.
    evidence: d.labelText.trim() ? "label_read" : "item_seen",
  } as Partial<ItemRead>;
  for (const [f] of NUMBER_FIELDS) read[f] = parseNumber(d.numbers[f]) ?? 0;
  for (const [f] of FLAG_FIELDS) read[f] = d.flags[f];
  return read as ItemRead;
}

export const DRAFT_KEY = "byt-typed-item";

const session = (): Storage | null => { try { return window.sessionStorage; } catch { return null; } };
// The same fields as the empty form, each of the same type, all the way down.
const sameShape = (a: unknown, b: unknown): boolean => {
  if (b === null || typeof b !== "object") return typeof a === typeof b;
  if (a === null || typeof a !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && sameShape((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
};

// The item still being typed in this tab, if one was kept and it has exactly the form's fields.
export function savedDraft(store: Pick<Storage, "getItem"> | null = session()): ReadDraft | null {
  try {
    const v: unknown = JSON.parse(store?.getItem(DRAFT_KEY) ?? "null");
    if (!sameShape(v, draftOf(null))) return null;
    const d = v as ReadDraft;
    const knownKind = d.category === "" || Object.hasOwn(CATEGORY_LABELS, d.category);
    return knownKind && (RETAIL_BOX_VALUES as readonly string[]).includes(d.retailBox) ? d : null;
  } catch {
    return null;
  }
}

function keep(draft: ReadDraft | null) {
  try {
    const store = session();
    if (!draft || JSON.stringify(draft) === JSON.stringify(draftOf(null))) store?.removeItem(DRAFT_KEY);
    else store?.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch { /* storage full or blocked: the draft lives on in the form */ }
}

export function AddByHand({ onAdd }: { onAdd: (read: ItemRead) => void }) {
  const [draft, setDraftState] = useState<ReadDraft>(() => savedDraft() ?? draftOf(null));
  const setDraft = (d: ReadDraft) => { setDraftState(d); keep(d); };
  const read = readFromDraft(draft);
  return (
    <form data-testid="add-by-hand" aria-label="Add an item by hand" onSubmit={(e) => {
      e.preventDefault();
      if (!read) return;
      onAdd(read);
      setDraftState(draftOf(null));
      keep(null);
    }}>
      <ReadFields draft={draft} onChange={setDraft} nameLabel="Name (optional)" />
      <button type="submit" disabled={!read}>Add</button>
    </form>
  );
}
