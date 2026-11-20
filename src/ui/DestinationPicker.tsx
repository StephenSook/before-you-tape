// Where the box is going. Each country with rules says who read them (from rulesReadBy, the same source as
// the card's rules line); any other country tells the sender to read its listing.
import type { RulesReadBy } from "../engine/layers";

export interface DestinationIndexEntry { code: string; name: string; immUrl: string }

const READ_BY: Record<RulesReadBy["by"], string> = { person: "rules checked by a person", usps_page: "rules read from the USPS page" };

export function DestinationPicker({ index, readBy, value, onChange }: { index: readonly DestinationIndexEntry[]; readBy: Readonly<Record<string, RulesReadBy["by"]>>; value: string; onChange: (code: string) => void }) {
  const chosen = index.find((d) => d.code === value);
  const isReviewed = value in readBy;
  return (
    <div>
      <label htmlFor="destination">To</label>{" "}
      <select id="destination" data-testid="destination-picker" value={value} onChange={(e) => onChange(e.target.value)}>
        {/* No country yet (the saved box is still being read): nothing is chosen, so any pick counts. */}
        {value === "" && <option value="" disabled>Choose a country</option>}
        {index.map((d) => (
          <option key={d.code} value={d.code}>{readBy[d.code] ? `${d.name} (${READ_BY[readBy[d.code]!]})` : d.name}</option>
        ))}
      </select>
      {!isReviewed && chosen && (
        <p data-testid="live-read-notice">
          We have not reviewed this country. Read its listing before you pack.{" "}
          <a href={chosen.immUrl} target="_blank" rel="noreferrer">{chosen.name} listing</a>
        </p>
      )}
    </div>
  );
}
