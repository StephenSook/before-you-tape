// The fields of an item read, as the sender edits them: plain labels, numbers that must not be negative,
// and an empty number meaning "not printed" (0), the same as the model's rule.
import { useEffect, useRef } from "react";
import { ITEM_CATEGORIES, RETAIL_BOX_VALUES, type ItemRead } from "../shared/itemRead";
import { CATEGORY_LABELS } from "./categoryLabels";

export type NumberField = "volts" | "milliampHours" | "wattHours" | "lithiumGrams";
export type FlagField = "liquid" | "pressurized" | "alcoholOnLabel" | "flammableOnLabel" | "glassContainer" | "powder" | "batteryWords";

export const NUMBER_FIELDS: ReadonlyArray<[NumberField, string]> = [
  ["volts", "Volts (V)"], ["milliampHours", "Milliamp-hours (mAh)"], ["wattHours", "Watt-hours (Wh)"], ["lithiumGrams", "Lithium (grams)"],
];
export const FLAG_FIELDS: ReadonlyArray<[FlagField, string]> = [
  ["liquid", "It is a liquid"], ["pressurized", "It is a spray or under pressure"], ["alcoholOnLabel", "The label lists alcohol"],
  ["flammableOnLabel", "The label says flammable"], ["glassContainer", "It is in glass"], ["powder", "It is a powder"],
  ["batteryWords", "The label mentions a battery"],
];
const BOX_LABELS: Record<ItemRead["retailBox"], string> = { sealed: "Still sealed in its box", open_or_none: "Opened, or no box", cannot_tell: "Can't tell" };

// The form keeps numbers as typed text so a half-typed value is not lost.
export interface ReadDraft {
  itemName: string;
  category: ItemRead["category"] | "";
  labelText: string;
  numbers: Record<NumberField, string>;
  flags: Record<FlagField, boolean>;
  retailBox: ItemRead["retailBox"];
}

export function draftOf(read: ItemRead | null): ReadDraft {
  return {
    itemName: read?.itemName ?? "",
    category: read?.category ?? "",
    labelText: read?.labelText ?? "",
    numbers: Object.fromEntries(NUMBER_FIELDS.map(([f]) => [f, read && read[f] ? String(read[f]) : ""])) as Record<NumberField, string>,
    flags: Object.fromEntries(FLAG_FIELDS.map(([f]) => [f, read ? read[f] : false])) as Record<FlagField, boolean>,
    retailBox: read?.retailBox ?? "cannot_tell",
  };
}

// The typed number, 0 for an empty field, or null when it is not a number of zero or more.
export function parseNumber(text: string): number | null {
  if (text.trim() === "") return 0;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function numbersValid(d: ReadDraft): boolean {
  return NUMBER_FIELDS.every(([f]) => parseNumber(d.numbers[f]) !== null);
}

export function ReadFields({ draft, onChange, focusField, nameLabel }: { draft: ReadDraft; onChange: (d: ReadDraft) => void; focusField?: keyof ItemRead; nameLabel: string }) {
  const refs = useRef<Partial<Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>>>({});
  useEffect(() => { if (focusField) refs.current[focusField]?.focus(); }, [focusField]);
  const id = (f: string) => `read-${f}`;
  return (
    <>
      <p>
        <label htmlFor={id("category")}>What is it?</label>{" "}
        <select id={id("category")} ref={(el) => { refs.current.category = el; }} value={draft.category}
          onChange={(e) => onChange({ ...draft, category: e.target.value as ReadDraft["category"] })}>
          {draft.category === "" && <option value="">Choose one</option>}
          {ITEM_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
      </p>
      <p>
        <label htmlFor={id("itemName")}>{nameLabel}</label>{" "}
        <input id={id("itemName")} ref={(el) => { refs.current.itemName = el; }} value={draft.itemName} onChange={(e) => onChange({ ...draft, itemName: e.target.value })} />
      </p>
      <p>
        <label htmlFor={id("labelText")}>Words on the label</label>{" "}
        <textarea id={id("labelText")} ref={(el) => { refs.current.labelText = el; }} rows={2} value={draft.labelText} onChange={(e) => onChange({ ...draft, labelText: e.target.value })} />
      </p>
      {NUMBER_FIELDS.map(([f, label]) => (
        <p key={f}>
          <label htmlFor={id(f)}>{label}</label>{" "}
          <input id={id(f)} ref={(el) => { refs.current[f] = el; }} type="number" step="any" inputMode="decimal" aria-invalid={parseNumber(draft.numbers[f]) === null}
            value={draft.numbers[f]} onChange={(e) => onChange({ ...draft, numbers: { ...draft.numbers, [f]: e.target.value } })} />
        </p>
      ))}
      {FLAG_FIELDS.map(([f, label]) => (
        <p key={f}>
          <label><input type="checkbox" checked={draft.flags[f]} onChange={(e) => onChange({ ...draft, flags: { ...draft.flags, [f]: e.target.checked } })} /> {label}</label>
        </p>
      ))}
      <p>
        <label htmlFor={id("retailBox")}>Its box</label>{" "}
        <select id={id("retailBox")} value={draft.retailBox} onChange={(e) => onChange({ ...draft, retailBox: e.target.value as ItemRead["retailBox"] })}>
          {RETAIL_BOX_VALUES.map((v) => <option key={v} value={v}>{BOX_LABELS[v]}</option>)}
        </select>
      </p>
    </>
  );
}
