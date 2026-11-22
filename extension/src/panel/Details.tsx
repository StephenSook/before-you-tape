import { useState, type FormEvent } from "react";
import type { BoxItemInput, ItemCategory, RuleEdition } from "../../../src/engine/types";
import { ITEM_CATEGORIES } from "../../../src/shared/itemRead";
import { checkOne, toBoxItem, typedRead } from "../check";
import type { ProductReading } from "./ProductText";
import { Verdict } from "./Verdict";

interface DetailsProps {
  edition: RuleEdition;
  today: string;
  itemName: string;
  onItemName(name: string): void;
  draft?: ProductReading & { revision: number };
}

const numbers = [
  ["volts", "Volts (V)"],
  ["milliampHours", "Milliamp hours (mAh)"],
  ["wattHours", "Watt hours (Wh)"],
  ["lithiumGrams", "Grams of lithium"],
] as const;

const flags = [
  ["batteryWords", "Lists a battery"],
  ["liquid", "Contains liquid"],
  ["pressurized", "Pressurized"],
  ["alcoholOnLabel", "Lists alcohol"],
  ["flammableOnLabel", "Lists a fire warning"],
  ["glassContainer", "Glass container"],
  ["powder", "Powder"],
] as const;

const categoryName = (value: ItemCategory) => value.replaceAll("_", " ");
const categories = ITEM_CATEGORIES.map((value) => {
  const words = categoryName(value);
  return { value, label: words[0]!.toUpperCase() + words.slice(1) };
});

export function Details({ edition, today, itemName, onItemName, draft }: DetailsProps) {
  const [country, setCountry] = useState("");
  const [checked, setChecked] = useState<{ item: BoxItemInput; revision: number } | null>(null);
  const revision = draft?.revision ?? 0;
  const destinations = Object.values(edition.destinations);
  const dest = destinations.find((entry) => entry.code === country) ?? destinations[0];
  const verdict = checked?.revision === revision && checked.item.read.itemName === itemName.trim() && dest
    ? checkOne(checked.item, edition, dest.code, today)
    : null;

  function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const read = {
      ...typedRead({
        itemName: itemName.trim(),
        category: form.get("category") as ItemCategory,
        volts: Number(form.get("volts")),
        milliampHours: Number(form.get("milliampHours")),
        wattHours: Number(form.get("wattHours")),
        batteryWords: form.has("batteryWords"),
        liquid: form.has("liquid"),
        pressurized: form.has("pressurized"),
        alcoholOnLabel: form.has("alcoholOnLabel"),
      }),
      lithiumGrams: Number(form.get("lithiumGrams")),
      flammableOnLabel: form.has("flammableOnLabel"),
      glassContainer: form.has("glassContainer"),
      powder: form.has("powder"),
    };
    // Shop words are shown for review. They never enter the rules engine as label evidence.
    const confirmed = read.itemName !== "" && (!draft || form.has("confirmed"));
    if (draft?.read.evidence === "not_sure" && !confirmed) read.evidence = "not_sure";
    setChecked({ item: toBoxItem(read, { confirmed, answers: {}, quantity: 1, typedByHand: !draft }), revision });
  }

  function answer(questionId: string, answerId: string) {
    setChecked((previous) => previous && {
      ...previous, item: { ...previous.item, answers: { ...previous.item.answers, [questionId]: answerId } },
    });
  }

  return (
    <>
      <form className="item-form" key={revision} onSubmit={check}>
        <label>
          What is it?
          <input name="itemName" value={itemName} onChange={(event) => {
            onItemName(event.currentTarget.value);
            setChecked(null);
          }} required />
        </label>
        <ItemType itemName={itemName} initialCategory={draft?.read.category} onChange={() => setChecked(null)} />
        {draft?.read.labelText && <p>Words from the shop page: {draft.read.labelText}</p>}
        <details open={draft ? true : undefined} onChange={() => setChecked(null)}>
          <summary>Battery and liquid details</summary>
          {numbers.map(([name, label]) => (
            <label key={name}>{label}<input name={name} type="number" min="0" step="any" defaultValue={draft?.read[name] || ""} /></label>
          ))}
          {flags.map(([name, label]) => (
            <label key={name}><input name={name} type="checkbox" defaultChecked={draft?.read[name]} /> {label}</label>
          ))}
        </details>
        <label>
          Sending to
          <select value={dest?.code ?? ""} onChange={(event) => setCountry(event.currentTarget.value)}>
            {destinations.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
          </select>
        </label>
        <button type="submit" disabled={!dest}>Check</button>
      </form>
      {verdict && <Verdict verdict={verdict} editionId={edition.editionId} onAnswer={answer} route={draft?.source} />}
    </>
  );
}

function ItemType({ itemName, initialCategory, onChange }: {
  itemName: string;
  initialCategory?: ItemCategory;
  onChange(): void;
}) {
  const [category, setCategory] = useState(initialCategory ?? "other");
  return (
    <>
      <label>
        Item type
        <select name="category" value={category} onChange={(event) => {
          setCategory(event.currentTarget.value as ItemCategory);
          onChange();
        }}>
          {categories.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      {initialCategory && (
        <label key={JSON.stringify([itemName, category])}>
          <input name="confirmed" type="checkbox" onChange={onChange} /> Is the item type {categoryName(category)}? Yes
        </label>
      )}
    </>
  );
}
