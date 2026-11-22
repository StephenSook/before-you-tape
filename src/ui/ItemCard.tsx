// One item in the box: the exact crop the model saw, the verdict, its first reason, where the read ran,
// the one question that would settle it, and the four rule layers behind the verdict.
import { useState } from "react";
import type { ImagePart } from "../ai/port";
import { secondLookStands, type BoxItem } from "../data/boxStore";
import { LABEL_TEXT_TAG } from "../engine/facts";
import { openDisputes, type DisputeField, type DisputeValues, type ItemVerdict, type LayerStatus } from "../engine/types";
import type { ItemCategory, ItemRead } from "../shared/itemRead";
import { CATEGORY_LABELS } from "./categoryLabels";
import { FixReading } from "./FixReading";
import { restatesQuestion } from "./questionReason";
import { QuestionRow } from "./QuestionRow";
import { SourceGlyph } from "./SourceGlyph";
import { VerdictChip } from "./VerdictChip";

export interface ItemCardProps {
  item: BoxItem;
  verdict: ItemVerdict;
  crop: ImagePart | null;
  onConfirm?: (itemId: string) => void;
  onAnswer?: (itemId: string, questionId: string, answerId: string) => void;
  onFix?: (itemId: string, patch: Partial<ItemRead>) => void;
  // The Wh (or lithium grams) printed on the label, typed by the sender, for an item whose read numbers are held.
  onConfirmNumber?: (itemId: string, field: "wattHours" | "lithiumGrams", value: number) => void;
  // A cloud second look in progress, or the message from one that failed.
  checking?: boolean;
  error?: string;
  onRetry?: (itemId: string) => void;
  // Offered when the camera read this item by itself on this device: the cloud look runs only on this press.
  onCloudLook?: (itemId: string) => void;
  // The newest card in the box; on a phone it stays in view at the bottom of the screen.
  newest?: boolean;
  // The sender picks which of the two reads is right about one disputed fact.
  onSettle?: (itemId: string, field: DisputeField, side: "device" | "cloud") => void;
  // The item's last save did not reach the server.
  unsaved?: boolean;
  onRetrySave?: () => void;
  // How many of this item go in the box (the lithium count depends on it), and taking it out of the box.
  onQuantity?: (itemId: string, n: number) => void;
  onRemove?: (itemId: string) => void;
}

// "How many" keeps what the sender is typing (an empty field mid-edit) and sends a whole number from 1 to 99 only
// when the sender leaves the field or presses Enter, so the counts passed on the way (1, then 10, on the way to
// 100) are never saved. Any other text is marked, says why, and gives way to the last good count on leaving.
function HowMany({ itemId, quantity, onChange }: { itemId: string; quantity: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(quantity));
  const [shown, setShown] = useState(quantity);
  if (shown !== quantity) {
    setShown(quantity);
    setText(String(quantity));
  }
  const n = Number(text);
  const valid = text.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= 99;
  const errorId = `how-many-error-${itemId}`;
  return (
    <>
      <label>
        How many{" "}
        <input type="number" min={1} max={99} step={1} inputMode="numeric" className="how-many" value={text}
          aria-invalid={valid ? undefined : true} aria-describedby={valid ? undefined : errorId}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          onBlur={() => {
            if (!valid) setText(String(quantity));
            else if (n !== quantity) onChange(n);
          }} />
      </label>
      {!valid && <span id={errorId} className="field-error">Type a whole number from 1 to 99.</span>}
    </>
  );
}

// A layer's freshness. "Checked" would read as a person's check, which the destination line describes itself.
const LAYER_STATE: Record<LayerStatus["state"], string> = { checked: "up to date", stale: "out of date", missing: "not loaded" };
// The destination line already says when its rules were read, so it does not repeat the date.
const layerLine = (l: LayerStatus) =>
  `${l.label} (${LAYER_STATE[l.state]}${l.checkedOn && !l.label.includes(l.checkedOn) ? `, ${l.checkedOn}` : ""})`;

const DISPUTE_LABEL: Record<DisputeField, string> = {
  category: "What it is", retailBox: "Its box", battery: "Battery numbers", lithiumGrams: "Lithium metal",
  batteryWords: "Battery words", liquid: "Liquid", pressurized: "Under pressure", alcoholOnLabel: "Alcohol on the label",
  flammableOnLabel: "Flammable on the label", glassContainer: "Glass container", powder: "Powder", labelTags: "Label words",
  evidence: "How it was read",
};
const EVIDENCE_TEXT: Record<ItemRead["evidence"], string> = { label_read: "Read its label", item_seen: "Saw the item only", not_sure: "Not sure what it is" };
const BOX_TEXT: Record<ItemRead["retailBox"], string> = { sealed: "Sealed", open_or_none: "Open or no box", cannot_tell: "Can't tell" };

// One read's value of a disputed fact, in plain words.
function readingText(field: DisputeField, value: DisputeValues[DisputeField]): string {
  switch (field) {
    case "category": return CATEGORY_LABELS[value as ItemCategory];
    case "retailBox": return BOX_TEXT[value as ItemRead["retailBox"]];
    case "evidence": return EVIDENCE_TEXT[value as ItemRead["evidence"]];
    case "battery": {
      const b = value as DisputeValues["battery"];
      const parts = [b.volts > 0 ? `${b.volts} V` : "", b.milliampHours > 0 ? `${b.milliampHours} mAh` : "", b.wattHours > 0 ? `${b.wattHours} Wh` : ""].filter((p) => p !== "");
      return parts.length > 0 ? parts.join(", ") : "No numbers read";
    }
    // A zero or empty reading says only that nothing was read, never that nothing is there.
    case "lithiumGrams": return (value as number) > 0 ? `${value as number} g lithium` : "No lithium amount read";
    case "labelTags": {
      const words = wordsOf(value as string[]).map((t) => t.replace(/_/g, " "));
      return words.length > 0 ? words.join(", ") : "No warning words read";
    }
    default: return value ? "Yes" : "Not seen";
  }
}

const wordsOf = (tags: readonly string[]) => tags.filter((t) => t !== LABEL_TEXT_TAG);
const FLAG_FIELDS: readonly DisputeField[] = ["batteryWords", "liquid", "pressurized", "alcoholOnLabel", "flammableOnLabel", "glassContainer", "powder"];

// Whether picking one reading drops something the other read saw: a lithium amount, battery numbers, a hazard
// flag or a label word. Such a pick asks the sender to confirm first.
function dropsWhatOtherSaw(field: DisputeField, picked: DisputeValues[DisputeField], other: DisputeValues[DisputeField]): boolean {
  if (field === "lithiumGrams") return (picked as number) === 0 && (other as number) > 0;
  if (field === "battery") {
    const p = picked as DisputeValues["battery"];
    const o = other as DisputeValues["battery"];
    return p.volts === 0 && p.milliampHours === 0 && p.wattHours === 0 && (o.volts > 0 || o.milliampHours > 0 || o.wattHours > 0);
  }
  if (field === "labelTags") return wordsOf(other as string[]).some((t) => !(picked as string[]).includes(t));
  if (FLAG_FIELDS.includes(field)) return picked === false && other === true;
  return false;
}

const SIDE_NAME = { device: "first read", cloud: "second look" } as const;

const NUMBER_FIELDS = ["volts", "milliampHours", "wattHours", "lithiumGrams"] as const;
const number = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });

// The battery numbers the verdict rests on, so the sender can see them without opening the form: positive
// values only, and "Typed by you" once the sender typed any of them.
function batteryLine(item: BoxItem): string | null {
  const n = { ...item.read, ...item.overrides };
  const parts = [
    n.volts > 0 ? `${number(n.volts)} V` : "", n.milliampHours > 0 ? `${number(n.milliampHours)} mAh` : "",
    n.wattHours > 0 ? `${number(n.wattHours)} Wh` : "", n.lithiumGrams > 0 ? `${number(n.lithiumGrams)} g lithium` : "",
  ].filter((p) => p !== "");
  if (parts.length === 0) return null;
  const typed = item.readSource === "manual" || NUMBER_FIELDS.some((f) => item.overrides[f] !== undefined);
  return `${typed ? "Typed by you" : "Label read"}: ${parts.join(", ")}`;
}

// The section the engine gives its own checks (identity, reading, disagreeing reads, item count, rule layers).
const OWN_CHECK = "Before You Tape: ";

// Battery numbers read from a photo are held until the sender reads the label: they type the Wh (or, for a lithium
// metal cell with no Wh, the lithium grams) into an empty field, never a value filled in for them.
const labelNumberField = (read: ItemRead) => (read.wattHours > 0 ? "wattHours" : "lithiumGrams");
function LabelNumberCheck({ read, onCheck }: { read: ItemRead; onCheck: (field: "wattHours" | "lithiumGrams", value: number) => void }) {
  const field = labelNumberField(read);
  const [text, setText] = useState("");
  const value = Number(text.replace(",", "."));
  const usable = text.trim() !== "" && Number.isFinite(value) && value > 0;
  const label = field === "wattHours" ? "Type the Wh printed on the label" : "Type the lithium grams printed on the label";
  return (
    <form className="label-number" onSubmit={(e) => { e.preventDefault(); if (usable) { onCheck(field, value); setText(""); } }}>
      <label>{label} <input type="text" inputMode="decimal" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} /></label>{" "}
      <button type="submit" disabled={!usable}>Check the number</button>
    </form>
  );
}

export function ItemCard({ item, verdict, crop, onConfirm, onAnswer, onFix, onConfirmNumber, checking, error, onRetry, onCloudLook, newest, onSettle, unsaved, onRetrySave, onQuantity, onRemove }: ItemCardProps) {
  const [fixOpen, setFixOpen] = useState(false);
  const [focusField, setFocusField] = useState<keyof ItemRead | undefined>(undefined);
  // The first reason, but not one that only restates the item's question, which the card asks just below.
  const reason = verdict.hits.find((h) => !restatesQuestion(h.text, verdict.question))?.text;
  const numbers = batteryLine(item);
  // Each published rule the verdict cites, once, as a link to its page. The app's own checks ("Before You Tape: ...")
  // are not published rules and no rule page explains them, so they are named once each as plain text.
  const rules = [...new Map(verdict.hits.filter((h) => !h.section.startsWith(OWN_CHECK)).map((h) => [`${h.section}|${h.url}`, h])).values()];
  const ownChecks = [...new Set(verdict.hits.filter((h) => h.section.startsWith(OWN_CHECK)).map((h) => h.section))];
  const needsIdentity = verdict.hits.some((h) => h.ruleId === "DATA-IDENTITY");
  const needsRating = verdict.hits.some((h) => h.ruleId === "USPS-INTL-LI-NO-WH");
  const needsLithium = verdict.hits.some((h) => h.ruleId === "USPS-INTL-LI-METAL-UNKNOWN");
  const name = item.overrides.itemName ?? item.read.itemName;
  const disputed = openDisputes(item.disputes);
  const [asking, setAsking] = useState<{ field: DisputeField; side: "device" | "cloud" } | null>(null);
  return (
    <article data-testid="item-card" id={`item-${item.itemId}`} tabIndex={-1} className={newest ? "card newest" : "card"} aria-label={name}>
      {crop && <img data-testid="crop-image" src={`data:${crop.mimeType};base64,${crop.base64}`} alt={`The photo of ${name} that was read`} />}
      <p className="item-name">{name}{item.quantity > 1 ? ` x ${item.quantity}` : ""}</p>
      <VerdictChip level={verdict.level} />
      {reason && <p>{reason}</p>}
      {numbers && <p data-testid="battery-numbers">{numbers}</p>}
      <SourceGlyph source={item.readSource} />
      {checking && <p role="status">Checking again in the cloud.</p>}
      {!checking && item.secondLook && <p data-testid="second-look">{item.secondLook.reason}</p>}
      {!checking && secondLookStands(item) && (
        <p data-testid="second-look-agreed">A second model in the cloud read the same, so this counts as checked. Use Fix this reading if it is wrong.</p>
      )}
      {error && <p role="alert">{error}</p>}
      {unsaved && <p role="alert">Not saved yet. This change is only on this device for now.</p>}
      {unsaved && onRetrySave && <button type="button" onClick={onRetrySave}>Try saving again</button>}
      {error && onRetry && <button type="button" onClick={() => onRetry(item.itemId)}>Try again</button>}
      {!checking && onCloudLook && <button type="button" data-testid="cloud-look" onClick={() => onCloudLook(item.itemId)}>Check it in the cloud</button>}
      {disputed.length > 0 && (
        <fieldset data-testid="disputes">
          <legend>The two reads disagree. Pick what the item shows.</legend>
          {disputed.map((f) => {
            const d = item.disputes![f]!;
            const pick = (side: "device" | "cloud") => {
              const other = side === "device" ? "cloud" : "device";
              if (dropsWhatOtherSaw(f, d[side], d[other])) setAsking({ field: f, side });
              else { setAsking(null); onSettle?.(item.itemId, f, side); }
            };
            const ask = asking?.field === f ? asking : null;
            const other = ask ? (ask.side === "device" ? "cloud" : "device") : null;
            const otherSaw = other ? (FLAG_FIELDS.includes(f) ? DISPUTE_LABEL[f].toLowerCase() : readingText(f, d[other])) : "";
            const picked = ask ? readingText(f, d[ask.side]) : "";
            return (
              <div key={f} role="group" aria-label={DISPUTE_LABEL[f]}>
                <span>{DISPUTE_LABEL[f]}</span>{" "}
                <button type="button" onClick={() => pick("device")}>First read: {readingText(f, d.device)}</button>{" "}
                <button type="button" onClick={() => pick("cloud")}>Second look: {readingText(f, d.cloud)}</button>
                {ask && other && (
                  <>
                    <p role="alert">The {SIDE_NAME[other]} saw {otherSaw}. Use {picked} only if the item really shows that.</p>
                    <button type="button" onClick={() => { setAsking(null); onSettle?.(item.itemId, f, ask.side); }}>Yes, use {picked}</button>{" "}
                    <button type="button" onClick={() => setAsking(null)}>Keep both for now</button>
                  </>
                )}
              </div>
            );
          })}
        </fieldset>
      )}
      {verdict.question && <QuestionRow question={verdict.question} value={item.answers[verdict.question.id]} onAnswer={(q, a) => onAnswer?.(item.itemId, q, a)} />}
      {needsIdentity && <button type="button" data-testid="confirm-identity" onClick={() => onConfirm?.(item.itemId)}>Yes, this is {name}</button>}
      {needsRating && <button type="button" onClick={() => { setFocusField("wattHours"); setFixOpen(true); }}>Type the rating</button>}
      {needsLithium && <button type="button" onClick={() => { setFocusField("lithiumGrams"); setFixOpen(true); }}>Type the lithium amount</button>}
      {onConfirmNumber && verdict.hits.some((h) => h.ruleId === "USPS-INTL-LI-ONE-READ") && (
        // Keyed on the number asked for: a second look that changes it starts the field again, empty.
        <LabelNumberCheck key={labelNumberField({ ...item.read, ...item.overrides })} read={{ ...item.read, ...item.overrides }}
          onCheck={(field, value) => onConfirmNumber(item.itemId, field, value)} />
      )}
      {(onQuantity || onRemove) && (
        <p className="item-controls">
          {onQuantity && <HowMany itemId={item.itemId} quantity={item.quantity} onChange={(n) => onQuantity(item.itemId, n)} />}{" "}
          {onRemove && <button type="button" aria-label={`Remove ${name}`} onClick={() => onRemove(item.itemId)}>Remove</button>}
        </p>
      )}
      <details open={fixOpen} onToggle={(e) => setFixOpen(e.currentTarget.open)}>
        <summary>Fix this reading</summary>
        {/* Keyed on the overrides, so the form starts again from what the sender sees after each save. */}
        <FixReading key={JSON.stringify(item.overrides)} read={{ ...item.read, ...item.overrides }} focusField={focusField} labelTags={item.labelTags}
          onSave={(patch) => { onFix?.(item.itemId, patch); setFixOpen(false); setFocusField(undefined); }} />
      </details>
      <details>
        <summary>What we checked</summary>
        <ul data-testid="layer-list">
          {verdict.layers.map((l) => (
            <li key={l.id}>{layerLine(l)}</li>
          ))}
        </ul>
        {rules.length + ownChecks.length > 0 && (
          <ul data-testid="rule-list">
            {rules.map((h) => (
              <li key={`${h.section}|${h.url}`}><a href={h.url} target="_blank" rel="noopener noreferrer">Rule: {h.section}</a></li>
            ))}
            {ownChecks.map((section) => <li key={section}>{section}</li>)}
          </ul>
        )}
        <p data-testid="service">Service: {verdict.service}</p>
      </details>
    </article>
  );
}
