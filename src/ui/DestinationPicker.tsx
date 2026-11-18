// Where the box is going. Reviewed countries say so; any other country tells the sender to read its listing.
export interface DestinationIndexEntry { code: string; name: string; immUrl: string }

export function DestinationPicker({ index, reviewed, value, onChange }: { index: readonly DestinationIndexEntry[]; reviewed: readonly string[]; value: string; onChange: (code: string) => void }) {
  const chosen = index.find((d) => d.code === value);
  const isReviewed = reviewed.includes(value);
  return (
    <div>
      <label htmlFor="destination">To</label>{" "}
      <select id="destination" data-testid="destination-picker" value={value} onChange={(e) => onChange(e.target.value)}>
        {index.map((d) => (
          <option key={d.code} value={d.code}>{reviewed.includes(d.code) ? `${d.name} (rules reviewed)` : d.name}</option>
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
