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
}

const LAYER_STATE: Record<LayerStatus["state"], string> = { checked: "checked", stale: "out of date", missing: "not loaded" };

export function ItemCard({ item, verdict, crop, onConfirm, onAnswer, onFix }: ItemCardProps) {
  const [fixOpen, setFixOpen] = useState(false);
  const [focusField, setFocusField] = useState<keyof ItemRead | undefined>(undefined);
  const reason = verdict.hits[0]?.text;
  const needsIdentity = verdict.hits.some((h) => h.ruleId === "DATA-IDENTITY");
  const needsRating = verdict.hits.some((h) => h.ruleId === "USPS-INTL-LI-NO-WH");
  const name = item.overrides.itemName ?? item.read.itemName;
  return (
    <article data-testid="item-card" className="card" aria-label={name}>
      {crop && <img data-testid="crop-image" src={`data:${crop.mimeType};base64,${crop.base64}`} alt={`The photo of ${name} that was read`} />}
      <p className="item-name">{name}{item.quantity > 1 ? ` x ${item.quantity}` : ""}</p>
      <VerdictChip level={verdict.level} />
      {reason && <p>{reason}</p>}
      <SourceGlyph source={item.readSource} />
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
