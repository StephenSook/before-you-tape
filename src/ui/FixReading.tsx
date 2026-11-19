// The sender corrects what was read. Only the fields they edited are saved, as overrides on top of the read.
// A second look can land while the form is open: an untouched field then shows the new reading, and a field
// the sender had edited is reset to it with a note, so no choice made against the old reading is saved.
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

type Field = keyof ItemRead;
const TEXT_FIELDS = ["itemName", "category", "labelText", "retailBox"] as const;

// The read fields whose value differs between two drafts.
function draftFields(a: ReadDraft, b: ReadDraft): Field[] {
  const out: Field[] = TEXT_FIELDS.filter((f) => a[f] !== b[f]);
  for (const [f] of NUMBER_FIELDS) if (a.numbers[f] !== b.numbers[f]) out.push(f);
  for (const [f] of FLAG_FIELDS) if (a.flags[f] !== b.flags[f]) out.push(f);
  return out;
}

// The draft with the given fields set back to a reading.
function rebase(d: ReadDraft, read: ItemRead, fields: readonly Field[]): ReadDraft {
  const fresh = draftOf(read);
  const next: ReadDraft = { ...d, numbers: { ...d.numbers }, flags: { ...d.flags } };
  for (const f of fields) {
    if ((TEXT_FIELDS as readonly string[]).includes(f)) (next as unknown as Record<string, unknown>)[f] = fresh[f as (typeof TEXT_FIELDS)[number]];
    else if (f in next.numbers) next.numbers[f as keyof ReadDraft["numbers"]] = fresh.numbers[f as keyof ReadDraft["numbers"]];
    else if (f in next.flags) next.flags[f as keyof ReadDraft["flags"]] = fresh.flags[f as keyof ReadDraft["flags"]];
  }
  return next;
}

const LABEL: Partial<Record<Field, string>> = { category: "what it is", itemName: "the name", labelText: "the label text", retailBox: "the box" };
const labelOf = (f: Field) => LABEL[f] ?? [...NUMBER_FIELDS, ...FLAG_FIELDS].find(([k]) => k === f)?.[1] ?? f;

// The engine's tags that say the label names a battery.
const BATTERY_TAGS = new Set(["li_ion", "li_metal", "battery_label", "power_bank_label"]);

export function FixReading({ read, onSave, focusField, labelTags = [] }: {
  read: ItemRead; onSave: (patch: Partial<ItemRead>) => void; focusField?: keyof ItemRead;
  // The item's label tags, so a battery the label names (a coin cell) shows its numbers.
  labelTags?: readonly string[];
}) {
  // The reading the draft is measured against, the fields the sender edited, and the ones a second look reset.
  const [base, setBase] = useState<ItemRead>(read);
  const [draft, setDraft] = useState<ReadDraft>(() => draftOf(read));
  const [touched, setTouched] = useState<ReadonlySet<Field>>(new Set());
  const [reset, setReset] = useState<Field[]>([]);

  // The reading changed under the form (a second look landed): adjust while rendering, once per change.
  const moved = (Object.keys(read) as Field[]).filter((f) => read[f] !== base[f]);
  if (moved.length > 0) {
    setBase(read);
    setDraft(rebase(draft, read, moved));
    setReset(moved.filter((f) => touched.has(f)));
    setTouched(new Set([...touched].filter((f) => !moved.includes(f))));
  }

  const change = (next: ReadDraft) => {
    const edited = draftFields(draft, next);
    setTouched((t) => new Set([...t, ...edited]));
    setReset((r) => r.filter((f) => !edited.includes(f)));
    setDraft(next);
  };
  const save = () => {
    const all = changedFields(base, draft);
    const patch = Object.fromEntries(Object.entries(all).filter(([f]) => touched.has(f as Field))) as Partial<ItemRead>;
    onSave(patch);
  };
  return (
    <form data-testid="fix-reading" onSubmit={(e) => { e.preventDefault(); save(); }}>
      {reset.length > 0 && <p role="status">The second look changed {reset.map(labelOf).join(", ")}. Check it again before you save.</p>}
      <ReadFields draft={draft} onChange={change} focusField={focusField} nameLabel="Name" batteryLabel={labelTags.some((t) => BATTERY_TAGS.has(t))} />
      <button type="submit" disabled={!numbersValid(draft)}>Save</button>
    </form>
  );
}
