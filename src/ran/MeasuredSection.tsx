// The measured numbers on /ran: our own controlled test first (src/ran/eval.json), then the totals from visitors'
// saved boxes (src/ran/measured.json). Each is one line with its detail behind a disclosure, and each shows no number
// at all from a file it cannot read; the saved-box totals also show none once they are stale (src/ran/measured.ts).
import bundledEdition from "../../rules/edition.json";
import { longDate } from "../engine/destination";
import { readRescoreSummary, type RescoreSummary } from "../eval/rescoreRecord";
import { LABEL_TEXT_MAX } from "../shared/itemRead";
import { readEval, type EvalSummary } from "./evalSummary";
import { readMeasured, STALE_DAYS } from "./measured";
import type { Count, Measured, Timed } from "./summarize";

const count = (c: Count | Timed) => ("fewerThan" in c ? "fewer than 5" : c.n.toLocaleString("en-US"));
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const timed = (t: Timed) => ("fewerThan" in t ? "fewer than 5" : `${count(t)}, median ${seconds(t.p50Ms)}, 90th percentile ${seconds(t.p90Ms)}`);
const span = (w: NonNullable<Measured["window"]>) =>
  w.from.slice(0, 4) === w.to.slice(0, 4) ? `${longDate(w.from).replace(/, \d{4}$/, "")} to ${longDate(w.to)}` : `${longDate(w.from)} to ${longDate(w.to)}`;

// The rule edition this build runs, to say beside our test's numbers when the test ran on an earlier one.
const CURRENT = { editionId: bundledEdition.editionId, revision: bundledEdition.revision };

// Beside an earlier edition: what re-scoring the test's saved reads on the edition this build runs found
// (src/eval/rescoreRecord.ts), or, with no re-score for this edition, that a verdict today can differ.
function editionNote(e: EvalSummary, r: RescoreSummary | null): string {
  if (e.editionId === CURRENT.editionId) return "";
  const now = `, an earlier edition: the app now runs ${CURRENT.editionId} (revision ${CURRENT.revision})`;
  if (!r || r.editionId !== CURRENT.editionId || r.runId !== e.runId) return `${now}, so a verdict today can differ.`;
  const found = r.shippedChanged === 0 ? "no verdict changed" : `${r.shippedChanged} of ${r.shippedRows} verdicts changed`;
  const gaps = r.clippedItems === 0
    ? `The ${r.secondLookItems} items that got a second look could not be re-scored: the run did not save the reads the second look compared.`
    : `It could not re-score ${r.secondLookItems + r.clippedItems} items: ${r.secondLookItems} got a second look, whose compared reads the run did ` +
      `not save, and ${r.clippedItems} had ${r.clippedItems === 1 ? "a saved label" : "saved labels"} at the ${LABEL_TEXT_MAX}-character limit, ` +
      `so part of ${r.clippedItems === 1 ? "it" : "them"} may be missing.`;
  const ahead = r.upcoming.map((u) => ` USPS has announced a suspension of mail to ${u.name} from ${longDate(u.from)}: from that day, our ` +
    `test's "OK to pack" verdicts for ${u.name} read "Check this".`).join("");
  return `${now}. Re-scored on it with the saved reads, applying the rules as of ${longDate(r.date)}: ${found} for the ` +
    `${r.shippedItems} items it could re-score. ${gaps}${ahead}`;
}

function OurTest({ e, rescored }: { e: EvalSummary; rescored: RescoreSummary | null }) {
  const onDevice = e.readOnDevice === e.checks ? `All ${e.checks} checks were` : `${e.readOnDevice} of ${e.checks} checks were`;
  const looks = `${e.secondLookItems} ${e.secondLookItems === 1 ? "item" : "items"} also got a second look in the cloud`;
  const w = e.withoutRuleChanges;
  const hazards = e.hazardsCalledOk.k === 0
    ? `no hazard was called OK to pack (0 of ${e.hazardsCalledOk.n})`
    : `${e.hazardsCalledOk.k} of ${e.hazardsCalledOk.n} hazards were called OK to pack`;
  return (
    <>
      <p data-testid="eval-measured">
        {e.items} items for {e.destinations} countries. {onDevice} read on the device by Chrome's built-in model, {looks},
        and {hazards}. Run {longDate(e.date)}.
      </p>
      <details>
        <summary>How our test was run</summary>
        <ul>
          <li>Agreement with our draft labels: {e.agreement.k} of {e.agreement.n} checks. No second person has checked the labels, so this is not accuracy.</li>
          <li>
            {e.items - w.items} of the {e.items} items prompted rule changes; without them, {w.agreement.k} of {w.agreement.n} checks
            agree and {w.hazardsCalledOk.k} of {w.hazardsCalledOk.n} hazards were called OK.
          </li>
          <li>Check this: {e.checkThis.k} of {e.checkThis.n} checks</li>
          <li>Time to a verdict: median {seconds(e.p50Ms)}, 90th percentile {seconds(e.p90Ms)}, second look included</li>
          <li>Computer: {e.machine}, Chrome {e.chrome}</li>
          <li>Models: {e.models}</li>
          <li>
            Rules: edition {e.editionId}
            {editionNote(e, rescored)}
          </li>
        </ul>
        <p>Source: {e.source}. These are our own test photos, not visitors'.</p>
      </details>
    </>
  );
}

function Visitors({ m }: { m: Measured }) {
  return (
    <>
      <p data-testid="measured">
        {count(m.reads.inCloud)} items read in the cloud (counting reads whose route the SDK did not report) and{" "}
        {count(m.reads.onDevice)} on the device, in {count(m.boxes)} saved
        boxes, our own test runs included, so these show where reads ran, not how many people used the app. The records
        don't say why a read went to the cloud. Measured {longDate(m.measuredAt.slice(0, 10))}.
      </p>
      <details>
        <summary>How this was measured</summary>
        <ul>
          <li>Read in the cloud, or by a route the SDK did not report: {timed(m.reads.inCloud)}</li>
          <li>Read on the device: {timed(m.reads.onDevice)}</li>
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
    </>
  );
}

// evalFile, rescoreFile and file: the eval summary, its re-score summary and the saved-box totals to show; today: this
// device's date.
export function MeasuredSection({ evalFile, rescoreFile, file, today }: { evalFile: unknown; rescoreFile: unknown; file: unknown; today: string }) {
  const e = readEval(evalFile);
  const r = readMeasured(file, today);
  return (
    <section aria-labelledby="measured-heading">
      <h2 id="measured-heading">Measured</h2>
      <h3>Our test</h3>
      {e.ok ? <OurTest e={e.data} rescored={readRescoreSummary(rescoreFile)} /> : <p data-testid="eval-measured">Our test numbers are not shown: the file could not be read.</p>}
      <h3>Saved boxes, our own checks included</h3>
      {r.ok ? <Visitors m={r.data} /> : (
        <p data-testid="measured">
          Measured numbers are not shown: {r.reason === "stale" ? `they are more than ${STALE_DAYS} days old.` : "the file could not be read."}
        </p>
      )}
    </section>
  );
}
