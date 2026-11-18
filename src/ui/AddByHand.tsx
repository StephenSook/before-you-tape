// The sender types an item instead of showing it. It counts as typed by the sender, never as a model read.
import { useState } from "react";
import type { ItemRead } from "../shared/itemRead";
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

export function AddByHand({ onAdd }: { onAdd: (read: ItemRead) => void }) {
  const [draft, setDraft] = useState<ReadDraft>(() => draftOf(null));
  const read = readFromDraft(draft);
  return (
    <form data-testid="add-by-hand" aria-label="Add an item by hand" onSubmit={(e) => {
      e.preventDefault();
      if (!read) return;
      onAdd(read);
      setDraft(draftOf(null));
    }}>
      <ReadFields draft={draft} onChange={setDraft} nameLabel="Name (optional)" />
      <button type="submit" disabled={!read}>Add</button>
    </form>
  );
}
