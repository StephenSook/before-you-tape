// The measured totals on /ran: one line of what was measured and when, the detail behind a disclosure, and no
// number at all from a file that is stale or cannot be read (src/ran/measured.ts).
import { longDate } from "../engine/destination";
import { readMeasured } from "./measured";
import type { Count, Measured, Timed } from "./summarize";

const count = (c: Count | Timed) => ("fewerThan" in c ? "fewer than 5" : c.n.toLocaleString("en-US"));
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const timed = (t: Timed) => ("fewerThan" in t ? "fewer than 5" : `${count(t)}, median ${seconds(t.p50Ms)}, 90th percentile ${seconds(t.p90Ms)}`);
const span = (w: NonNullable<Measured["window"]>) =>
  w.from.slice(0, 4) === w.to.slice(0, 4) ? `${longDate(w.from).replace(/, \d{4}$/, "")} to ${longDate(w.to)}` : `${longDate(w.from)} to ${longDate(w.to)}`;

export function MeasuredSection({ file, today }: { file: unknown; today: string }) {
  const r = readMeasured(file, today);
  if (!r.ok) {
    return (
      <p data-testid="measured">
        Measured numbers are not shown: {r.reason === "stale" ? "they are more than 14 days old." : "the file could not be read."}
      </p>
    );
  }
  const m = r.data;
  return (
    <section aria-labelledby="measured-heading">
      <h2 id="measured-heading">Measured</h2>
      <p data-testid="measured">
        {count(m.reads.inCloud)} items read in the cloud and {count(m.reads.onDevice)} on this device, in {count(m.boxes)} saved
        boxes. Measured {longDate(m.measuredAt.slice(0, 10))}.
      </p>
      <details>
        <summary>How this was measured</summary>
        <ul>
          <li>Read in the cloud: {timed(m.reads.inCloud)}</li>
          <li>Read on this device: {timed(m.reads.onDevice)}</li>
          <li>Second looks in the cloud: {timed(m.secondLooks)}</li>
          <li>Cloud fallbacks: {count(m.fallbacks)}</li>
          <li>Typed by hand, our own deploy checks included: {count(m.typedByHand)}</li>
          <li>Items: {count(m.items)}, in {count(m.boxes)} saved boxes{m.window ? `, saved from ${span(m.window)}` : ""}</li>
        </ul>
        <p>
          Source: {m.source}. These totals include our own checks. Any total under 5 shows as fewer than 5, so no number
          points at one visitor.
        </p>
      </details>
    </section>
  );
}
