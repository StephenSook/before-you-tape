// Re-scores a saved model run on a rule edition with no model call: each saved read is judged again by the app's own
// box store, as the runner judged it (src/eval/runner.ts). The device and cloud paths saved the read they judged, and
// so did the shipped route when no second look ran. A second look's verdict also rests on the first read and the
// cloud read it compared (src/shared/secondLook.ts, readDisputes), which the run did not save, so those shipped rows
// are not re-scored. A saved read keeps at most LABEL_TEXT_MAX characters of its label, while the runner judged label
// words and figures from the whole label, so a read whose saved label reached that length is not re-scored either:
// a word past the cut could count live and not here. On the run's own edition and date (scoreClipped) such a read is
// re-scored, because the published level it must give back checks it (src/eval/rescoreRecord.test.ts).
import type { ReadOutcome } from "../ai/itemRead";
import { noPersistence } from "../data/boxOps";
import { createBoxStore } from "../data/boxStore";
import type { RuleEdition } from "../engine/types";
import { isNoItem } from "../shared/noItem";
import { LABEL_TEXT_MAX, type ItemCategory, type ItemRead } from "../shared/itemRead";
import { rulesOnlyRun } from "./baselines";
import type { EvalSet, Level } from "./types";

type SavedPath = { level: Level; read?: ItemRead; noItem?: true };
type SavedShipped = { level: Level; source: string; secondLook: boolean; read?: ItemRead };
export interface SavedRun {
  runId: string;
  date: string;
  editionId: string;
  rows: { itemId: string; destination: string; device: SavedPath | null; cloud: SavedPath | null; shipped: SavedShipped }[];
}

// A verdict and what it rests on: each rule hit as "<rule id>:<level>", and the question it asks, if any.
export interface Verdict { level: Level; rules: string[]; question: string | null }
export type NotRescored = { notRescored: "second_look" | "clipped_label" | "no_verdict" };
export type ShippedVerdict = Verdict | NotRescored;
// A path that did not run is null.
export interface RescoredRow {
  itemId: string;
  destination: string;
  rulesOnly: Level;
  device: Verdict | NotRescored | null;
  cloud: Verdict | NotRescored | null;
  shipped: ShippedVerdict;
}

// A saved label this long may have been cut (src/shared/itemRead.ts clips it to LABEL_TEXT_MAX characters).
const cut = (read: ItemRead) => Array.from(read.labelText).length >= LABEL_TEXT_MAX;
const CLIPPED: NotRescored = { notRescored: "clipped_label" };

// The shipped sources that carry no verdict (src/eval/runner.ts).
const NO_VERDICT = new Set(["not_run", "no_item", "failed", "too_slow"]);

// The verdict the Pack page shows for this read, alone in its box, for each destination (runner.ts, judged()).
function judge(edition: RuleEdition, date: string, destinations: readonly string[], read: ItemRead, source: string,
  route: ReadOutcome["route"]): Record<string, Verdict> {
  let n = 0;
  const store = createBoxStore({ edition: () => edition, persistence: noPersistence(), now: () => 0, today: () => date, newId: () => `rescore-${n++}` });
  const outcome = { read, source, ms: 0, route, recoveredFrom: null } as ReadOutcome;
  const itemId = store.addRead(outcome, "rescore");
  const out: Record<string, Verdict> = {};
  for (const d of destinations) {
    store.setDestination(d);
    const v = store.getState().result.items[itemId];
    if (!v) throw new Error(`no verdict for ${itemId} in ${d}`);
    out[d] = { level: v.level, rules: v.hits.map((h) => `${h.ruleId}:${h.level}`), question: v.question?.id ?? null };
  }
  return out;
}

export function rescore(run: SavedRun, set: EvalSet, typed: Readonly<Record<string, ItemCategory>>, edition: RuleEdition,
  date: string, opts: { scoreClipped?: boolean } = {}): RescoredRow[] {
  const rulesOnly = rulesOnlyRun(set, typed, edition, { date, machine: "rescore", editionId: edition.editionId }).rows;
  const levelOf = new Map(rulesOnly.map((r) => [`${r.itemId}|${r.destination}`, r.shipped.level]));
  // One read per item and path: the first row of each item carries it, as in the runner.
  const firstRow = new Map<string, SavedRun["rows"][number]>();
  for (const r of run.rows) if (!firstRow.has(r.itemId)) firstRow.set(r.itemId, r);
  type PerDestination = Record<string, Verdict> | NotRescored;
  const judged = new Map<string, { device: PerDestination | null; cloud: PerDestination | null; shipped: PerDestination }>();
  for (const [itemId, r] of firstRow) {
    // A read of no item gets no card on the Pack page; the runner gives it "Check this" with no rule.
    const path = (p: SavedPath | null, route: ReadOutcome["route"], source: string): PerDestination | null => {
      if (!p) return null;
      if (!p.read) throw new Error(`${itemId}: a path that ran has no saved read`);
      if (p.noItem || isNoItem(p.read)) return Object.fromEntries(set.destinations.map((d) => [d, { level: "check" as Level, rules: [], question: null }]));
      return cut(p.read) && !opts.scoreClipped ? CLIPPED : judge(edition, date, set.destinations, p.read, source, route);
    };
    const s = r.shipped;
    let shipped: PerDestination;
    if (NO_VERDICT.has(s.source)) shipped = { notRescored: "no_verdict" };
    else if (s.secondLook) shipped = { notRescored: "second_look" };
    else if (!s.read) throw new Error(`${itemId}: shipped verdict with no saved read`);
    else if (cut(s.read) && !opts.scoreClipped) shipped = CLIPPED;
    else shipped = judge(edition, date, set.destinations, s.read, s.source, "hybrid");
    judged.set(itemId, { device: path(r.device, "device_only", "on_device"), cloud: path(r.cloud, "cloud_only", "in_cloud"), shipped });
  }
  return run.rows.map((r) => {
    const j = judged.get(r.itemId)!;
    const level = levelOf.get(`${r.itemId}|${r.destination}`);
    if (level === undefined) throw new Error(`${r.itemId}: not in the eval set`);
    const pick = (p: PerDestination | null): Verdict | NotRescored | null =>
      (p === null ? null : "notRescored" in p ? p as NotRescored : (p as Record<string, Verdict>)[r.destination]!);
    return { itemId: r.itemId, destination: r.destination, rulesOnly: level, device: pick(j.device), cloud: pick(j.cloud), shipped: pick(j.shipped)! };
  });
}
