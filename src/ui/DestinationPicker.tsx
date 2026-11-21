// Where the box is going: one button per country, a radio group with one tab stop and the arrow keys. The note
// under it says who read the chosen country's rules (from rulesReadBy, the same source as the card's rules line);
// any other country tells the sender to read its listing. A country can carry a badge, such as a suspension the
// post office has announced. While the saved box is still being read, no country is marked.
import { useRef, type KeyboardEvent } from "react";
import type { RulesReadBy } from "../engine/layers";

export interface DestinationIndexEntry { code: string; name: string; immUrl: string }

const READ_BY: Record<RulesReadBy["by"], string> = { person: "Rules checked by a person.", usps_page: "Rules read from the USPS page." };

export interface DestinationPickerProps {
  index: readonly DestinationIndexEntry[];
  readBy: Readonly<Record<string, RulesReadBy["by"]>>;
  value: string;
  onChange: (code: string) => void;
  badges?: Readonly<Record<string, string>>;
}

export function DestinationPicker({ index, readBy, value, onChange, badges = {} }: DestinationPickerProps) {
  const chosen = index.find((d) => d.code === value);
  const by = value in readBy ? readBy[value] : undefined;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const focusIndex = Math.max(0, index.findIndex((d) => d.code === value));

  const onKey = (e: KeyboardEvent, at: number) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = (at + step + index.length) % index.length;
    refs.current[next]?.focus();
    onChange(index[next]!.code);
  };

  return (
    <div className="destination">
      <p id="destination-label" className="destination-label">Sending to</p>
      <div role="radiogroup" aria-labelledby="destination-label" data-testid="destination-picker" className="segmented">
        {index.map((d, i) => (
          <button key={d.code} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={d.code === value}
            tabIndex={i === focusIndex ? 0 : -1} className="segment" onClick={() => onChange(d.code)} onKeyDown={(e) => onKey(e, i)}>
            {d.name}
            {badges[d.code] && <span className="segment-badge">{badges[d.code]}</span>}
          </button>
        ))}
      </div>
      {value === "" && <p className="destination-note">Choose where the box is going.</p>}
      {by && (
        <p data-testid="rules-read-by" className="destination-note">{READ_BY[by]} <a href="/rules">See the rules</a></p>
      )}
      {!by && chosen && (
        <p data-testid="live-read-notice">
          We have not reviewed this country. Read its listing before you pack.{" "}
          <a href={chosen.immUrl} target="_blank" rel="noreferrer">{chosen.name} listing</a>
        </p>
      )}
    </div>
  );
}
