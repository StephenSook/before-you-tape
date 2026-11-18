// The sender corrects what was read. Only the fields they changed are saved, as overrides on top of the read.
import { useState } from "react";
import type { ItemRead } from "../shared/itemRead";
import { draftOf, FLAG_FIELDS, NUMBER_FIELDS, numbersValid, parseNumber, ReadFields, type ReadDraft } from "./ReadFields";

export function changedFields(read: ItemRead, d: ReadDraft): Partial<ItemRead> {
  const patch: Partial<ItemRead> = {};
  if (d.itemName !== read.itemName) patch.itemName = d.itemName;
  if (d.category !== "" && d.category !== read.category) patch.category = d.category;
  if (d.labelText !== read.labelText) patch.labelText = d.labelText;
  for (const [f] of NUMBER_FIELDS) {
    const n = parseNumber(d.numbers[f]);
    if (n !== null && n !== read[f]) patch[f] = n;
  }
  for (const [f] of FLAG_FIELDS) if (d.flags[f] !== read[f]) patch[f] = d.flags[f];
  if (d.retailBox !== read.retailBox) patch.retailBox = d.retailBox;
  return patch;
}

export function FixReading({ read, onSave, focusField }: { read: ItemRead; onSave: (patch: Partial<ItemRead>) => void; focusField?: keyof ItemRead }) {
  const [draft, setDraft] = useState<ReadDraft>(() => draftOf(read));
  return (
    <form data-testid="fix-reading" onSubmit={(e) => { e.preventDefault(); onSave(changedFields(read, draft)); }}>
      <ReadFields draft={draft} onChange={setDraft} focusField={focusField} nameLabel="Name" />
      <button type="submit" disabled={!numbersValid(draft)}>Save</button>
    </form>
  );
}
