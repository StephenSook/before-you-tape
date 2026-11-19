// The whole box at a glance: counts by verdict, the lithium count against its limits, "Ready to tape" once
// nothing blocks the box, and, after a country change, the line that says the box was re-checked by the rules alone.
import type { LithiumLimits } from "../engine/types";
import type { BoxResult } from "../engine/verdict";

const range = ({ min, max }: { min: number; max: number }) => (min === max ? `${max}` : `${min} to ${max}`);

export function BoxSummary({ result, itemCount, recheck, limits }: { result: BoxResult; itemCount: number; recheck: { ms: number; country: string } | null; limits: LithiumLimits }) {
  const { counts, lithium } = result;
  // Ready only when every item is OK to pack, the lithium count fits, and mail to the country is open.
  const lithiumBlocks = lithium.status === "over" || lithium.status === "mixed" || lithium.status === "depends";
  const ready = itemCount > 0 && counts.takeOut === 0 && counts.check === 0 && !lithiumBlocks && !result.destination.suspended;
  const lithiumParts: string[] = [];
  if (lithium.cells.max > 0) lithiumParts.push(`${range(lithium.cells)} of ${limits.maxCells} cells`);
  if (lithium.batteries.max > 0) lithiumParts.push(`${range(lithium.batteries)} of ${limits.maxBatteries} batteries`);
  return (
    <section data-testid="box-summary" aria-label="Your box">
      <h2 id="box-heading" tabIndex={-1}>Your box</h2>
      {itemCount === 0 ? <p>Nothing in the box yet.</p> : (
        <ul>
          {counts.takeOut > 0 && <li>{counts.takeOut} to take out</li>}
          {counts.check > 0 && <li>{counts.check} to check</li>}
          {counts.ok > 0 && <li>{counts.ok} OK to pack</li>}
        </ul>
      )}
      {lithiumParts.length > 0 && <p>Lithium: {lithiumParts.join(", ")}</p>}
      {lithiumBlocks && <p>{lithium.text}</p>}
      {ready && <p data-testid="ready-to-tape" className="ready">Ready to tape. Everything here is OK to pack.</p>}
      {recheck && <p data-testid="recheck-line">Re-checked {itemCount} {itemCount === 1 ? "item" : "items"} for {recheck.country} in {recheck.ms} ms. 0 model calls.</p>}
    </section>
  );
}
