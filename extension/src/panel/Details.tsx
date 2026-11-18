import { useState, type FormEvent } from "react";
import type { BoxItemInput, ItemCategory, RuleEdition } from "../../../src/engine/types";
import { ITEM_CATEGORIES } from "../../../src/shared/itemRead";
import { checkOne, toBoxItem, typedRead, type TypedDetails } from "../check";
import { Verdict } from "./Verdict";

interface DetailsProps {
  edition: RuleEdition;
  today: string;
  itemName: string;
  onItemName(name: string): void;
}

const numbers = [
  ["volts", "Volts (V)"],
  ["milliampHours", "Milliamp hours (mAh)"],
  ["wattHours", "Watt hours (Wh)"],
] as const;

const flags = [
  ["batteryWords", "Lists a battery"],
  ["liquid", "Contains liquid"],
  ["pressurized", "Pressurized"],
  ["alcoholOnLabel", "Lists alcohol"],
] as const;

const categories = ITEM_CATEGORIES.map((value) => {
  const words = value.replaceAll("_", " ");
  return { value, label: words[0]!.toUpperCase() + words.slice(1) };
});

export function Details({ edition, today, itemName, onItemName }: DetailsProps) {
  const [country, setCountry] = useState("");
  const [checked, setChecked] = useState<BoxItemInput | null>(null);
  const destinations = Object.values(edition.destinations);
  const dest = destinations.find((entry) => entry.code === country) ?? destinations[0];
  const verdict = checked && checked.read.itemName === itemName.trim() && dest
    ? checkOne(checked, edition, dest.code, today)
    : null;

  function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const details: TypedDetails = {
      itemName: itemName.trim(),
      category: form.get("category") as ItemCategory,
      volts: Number(form.get("volts")),
      milliampHours: Number(form.get("milliampHours")),
      wattHours: Number(form.get("wattHours")),
      batteryWords: form.has("batteryWords"),
      liquid: form.has("liquid"),
      pressurized: form.has("pressurized"),
      alcoholOnLabel: form.has("alcoholOnLabel"),
    };
    setChecked(toBoxItem(typedRead(details), { confirmed: details.itemName !== "", answers: {}, quantity: 1 }));
  }

  function answer(questionId: string, answerId: string) {
    setChecked((item) => item && { ...item, answers: { ...item.answers, [questionId]: answerId } });
  }

  return (
    <>
      <form className="item-form" onSubmit={check}>
        <label>
          What is it?
          <input name="itemName" value={itemName} onChange={(event) => {
            onItemName(event.currentTarget.value);
            setChecked(null);
          }} required />
        </label>
        <label>
          Item type
          <select name="category" defaultValue="other" onChange={() => setChecked(null)}>
            {categories.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <details onChange={() => setChecked(null)}>
          <summary>Battery and liquid details</summary>
          {numbers.map(([name, label]) => (
            <label key={name}>{label}<input name={name} type="number" min="0" step="any" /></label>
          ))}
          {flags.map(([name, label]) => (
            <label key={name}><input name={name} type="checkbox" /> {label}</label>
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
      {verdict && <Verdict verdict={verdict} editionId={edition.editionId} onAnswer={answer} />}
    </>
  );
}
