// One item in the box: the exact crop the model saw, the verdict, its first reason, where the read ran,
// the one question that would settle it, and the four rule layers behind the verdict.
import { useState } from "react";
import type { ImagePart } from "../ai/port";
import type { BoxItem } from "../data/boxStore";
import { LABEL_TEXT_TAG } from "../engine/facts";
import { openDisputes, type DisputeField, type DisputeValues, type ItemVerdict, type LayerStatus } from "../engine/types";
import type { ItemCategory, ItemRead } from "../shared/itemRead";
import { CATEGORY_LABELS } from "./categoryLabels";
import { FixReading } from "./FixReading";
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
}

const LAYER_STATE: Record<LayerStatus["state"], string> = { checked: "checked", stale: "out of date", missing: "not loaded" };

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
      return parts.length > 0 ? parts.join(", ") : "No numbers";
    }
    case "lithiumGrams": return (value as number) > 0 ? `${value as number} g lithium` : "No lithium metal";
    case "labelTags": {
      const words = (value as string[]).filter((t) => t !== LABEL_TEXT_TAG).map((t) => t.replace(/_/g, " "));
      return words.length > 0 ? words.join(", ") : "No warning words";
    }
    default: return value ? "Yes" : "No";
  }
}

export function ItemCard({ item, verdict, crop, onConfirm, onAnswer, onFix, checking, error, onRetry, onCloudLook, newest, onSettle }: ItemCardProps) {
  const [fixOpen, setFixOpen] = useState(false);
  const [focusField, setFocusField] = useState<keyof ItemRead | undefined>(undefined);
  const reason = verdict.hits[0]?.text;
  const needsIdentity = verdict.hits.some((h) => h.ruleId === "DATA-IDENTITY");
  const needsRating = verdict.hits.some((h) => h.ruleId === "USPS-INTL-LI-NO-WH");
  const name = item.overrides.itemName ?? item.read.itemName;
  const disputed = openDisputes(item.disputes);
  return (
    <article data-testid="item-card" id={`item-${item.itemId}`} className={newest ? "card newest" : "card"} aria-label={name}>
      {crop && <img data-testid="crop-image" src={`data:${crop.mimeType};base64,${crop.base64}`} alt={`The photo of ${name} that was read`} />}
      <p className="item-name">{name}{item.quantity > 1 ? ` x ${item.quantity}` : ""}</p>
      <VerdictChip level={verdict.level} />
      {reason && <p>{reason}</p>}
      <SourceGlyph source={item.readSource} />
      {checking && <p role="status">Checking again in the cloud.</p>}
      {!checking && item.secondLook && <p data-testid="second-look">{item.secondLook.reason}</p>}
      {error && <p role="alert">{error}</p>}
      {error && onRetry && <button type="button" onClick={() => onRetry(item.itemId)}>Try again</button>}
      {!checking && onCloudLook && <button type="button" data-testid="cloud-look" onClick={() => onCloudLook(item.itemId)}>Check it in the cloud</button>}
      {disputed.length > 0 && (
        <fieldset data-testid="disputes">
          <legend>The two reads disagree. Pick what the item shows.</legend>
          {disputed.map((f) => {
            const d = item.disputes![f]!;
            return (
              <div key={f} role="group" aria-label={DISPUTE_LABEL[f]}>
                <span>{DISPUTE_LABEL[f]}</span>{" "}
                <button type="button" onClick={() => onSettle?.(item.itemId, f, "device")}>First read: {readingText(f, d.device)}</button>{" "}
                <button type="button" onClick={() => onSettle?.(item.itemId, f, "cloud")}>Second look: {readingText(f, d.cloud)}</button>
              </div>
            );
          })}
        </fieldset>
      )}
      {verdict.question && <QuestionRow question={verdict.question} value={item.answers[verdict.question.id]} onAnswer={(q, a) => onAnswer?.(item.itemId, q, a)} />}
      {needsIdentity && <button type="button" data-testid="confirm-identity" onClick={() => onConfirm?.(item.itemId)}>Yes, this is {name}</button>}
      {needsRating && <button type="button" onClick={() => { setFocusField("wattHours"); setFixOpen(true); }}>Type the rating</button>}
      <details open={fixOpen} onToggle={(e) => setFixOpen(e.currentTarget.open)}>
        <summary>Fix this reading</summary>
        {/* Keyed on the overrides, so the form starts again from what the sender sees after each save. */}
        <FixReading key={JSON.stringify(item.overrides)} read={{ ...item.read, ...item.overrides }} focusField={focusField}
          onSave={(patch) => { onFix?.(item.itemId, patch); setFixOpen(false); setFocusField(undefined); }} />
      </details>
      <details>
        <summary>What we checked</summary>
        <ul data-testid="layer-list">
          {verdict.layers.map((l) => (
            <li key={l.id}>{l.label}: {LAYER_STATE[l.state]}{l.checkedOn ? `, ${l.checkedOn}` : ""}</li>
          ))}
        </ul>
        <p>{verdict.service}</p>
      </details>
    </article>
  );
}
