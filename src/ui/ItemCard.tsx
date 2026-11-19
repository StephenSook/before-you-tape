// One item in the box: the exact crop the model saw, the verdict, its first reason, where the read ran,
// the one question that would settle it, and the four rule layers behind the verdict.
import { useState } from "react";
import type { ImagePart } from "../ai/port";
import type { BoxItem } from "../data/boxStore";
import type { ItemVerdict, LayerStatus } from "../engine/types";
import type { ItemRead } from "../shared/itemRead";
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
}

// A layer's freshness. "Checked" would read as a person's check, which the destination line describes itself.
const LAYER_STATE: Record<LayerStatus["state"], string> = { checked: "up to date", stale: "out of date", missing: "not loaded" };
// The destination line already says when its rules were read, so it does not repeat the date.
const layerLine = (l: LayerStatus) =>
  `${l.label} (${LAYER_STATE[l.state]}${l.checkedOn && !l.label.includes(l.checkedOn) ? `, ${l.checkedOn}` : ""})`;

export function ItemCard({ item, verdict, crop, onConfirm, onAnswer, onFix, checking, error, onRetry, onCloudLook, newest }: ItemCardProps) {
  const [fixOpen, setFixOpen] = useState(false);
  const [focusField, setFocusField] = useState<keyof ItemRead | undefined>(undefined);
  const reason = verdict.hits[0]?.text;
  const needsIdentity = verdict.hits.some((h) => h.ruleId === "DATA-IDENTITY");
  const needsRating = verdict.hits.some((h) => h.ruleId === "USPS-INTL-LI-NO-WH");
  const needsLithium = verdict.hits.some((h) => h.ruleId === "USPS-INTL-LI-METAL-UNKNOWN");
  const name = item.overrides.itemName ?? item.read.itemName;
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
      {verdict.question && <QuestionRow question={verdict.question} value={item.answers[verdict.question.id]} onAnswer={(q, a) => onAnswer?.(item.itemId, q, a)} />}
      {needsIdentity && <button type="button" data-testid="confirm-identity" onClick={() => onConfirm?.(item.itemId)}>Yes, this is {name}</button>}
      {needsRating && <button type="button" onClick={() => { setFocusField("wattHours"); setFixOpen(true); }}>Type the rating</button>}
      {needsLithium && <button type="button" onClick={() => { setFocusField("lithiumGrams"); setFixOpen(true); }}>Type the lithium amount</button>}
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
        <p data-testid="service">Service: {verdict.service}</p>
      </details>
    </article>
  );
}
