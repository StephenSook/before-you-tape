// The public record of a re-score (scripts/eval-rescore.ts) and the short summary /ran reads from it. The record holds
// levels, rule ids, item ids and editions only. Its first block is the run's own edition and date; the last block is
// the edition the summary speaks for, compared with the first on the shipped route.
import type { RescoredRow } from "./rescore";

export interface RescoreBlock {
  editionId: string;
  revision: number;
  date: string;
  editionFile: string;
  editionSha256: string;
  rows: RescoredRow[];
}
export interface RescoreRecord { runId: string; runSha256: string; setId: string; blocks: RescoreBlock[] }

export interface RescoreSummary {
  runId: string;
  source: string;
  editionId: string;
  revision: number;
  date: string;
  // Items whose shipped verdict was re-scored (no second look), their rows, and how many of those rows changed level.
  shippedItems: number;
  shippedRows: number;
  shippedChanged: number;
  // Items whose shipped verdict was not re-scored: it rests on a second look, whose compared reads the run did not
  // save, or the saved label was cut at LABEL_TEXT_MAX characters.
  secondLookItems: number;
  clippedItems: number;
}

export const RESCORE_SOURCE = "eval/runs/models-2026-11-21.rescored.public.json";

export function rescoreSummary(record: RescoreRecord): RescoreSummary {
  const first = record.blocks[0];
  const last = record.blocks[record.blocks.length - 1];
  if (!first || !last) throw new Error("a re-score record needs at least one block");
  // Only a second look or a cut label leaves a shipped verdict out; any other gap is refused, never counted as one.
  const reason = (r: RescoredRow) => ("notRescored" in r.shipped ? r.shipped.notRescored : null);
  for (const r of last.rows) {
    const why = reason(r);
    if (why !== null && why !== "second_look" && why !== "clipped_label") throw new Error(`${r.itemId} ${r.destination}: not re-scored (${why})`);
  }
  const rescored = last.rows.filter((r) => reason(r) === null);
  const before = new Map(first.rows.map((r) => [`${r.itemId}|${r.destination}`, r.shipped]));
  const changed = rescored.filter((r) => {
    const b = before.get(`${r.itemId}|${r.destination}`);
    if (!b || !("level" in b)) throw new Error(`${r.itemId} ${r.destination}: re-scored, but with no verdict on the run's own edition`);
    return b.level !== (r.shipped as { level: string }).level;
  });
  const items = (rows: RescoredRow[]) => new Set(rows.map((r) => r.itemId)).size;
  return {
    runId: record.runId, source: RESCORE_SOURCE, editionId: last.editionId, revision: last.revision, date: last.date,
    shippedItems: items(rescored), shippedRows: rescored.length, shippedChanged: changed.length,
    secondLookItems: items(last.rows.filter((r) => reason(r) === "second_look")),
    clippedItems: items(last.rows.filter((r) => reason(r) === "clipped_label")),
  };
}

const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

// The summary as /ran may show it, or null when the file is missing or not the shape written above.
export function readRescoreSummary(file: unknown): RescoreSummary | null {
  if (typeof file !== "object" || file === null || Array.isArray(file)) return null;
  const f = file as Record<string, unknown>;
  const keys = ["runId", "source", "editionId", "revision", "date", "shippedItems", "shippedRows", "shippedChanged", "secondLookItems", "clippedItems"];
  if (Object.keys(f).sort().join() !== [...keys].sort().join()) return null;
  if (![f.runId, f.source, f.editionId, f.date].every(isText)) return null;
  if (![f.revision, f.shippedItems, f.shippedRows, f.shippedChanged, f.secondLookItems, f.clippedItems].every(isCount)) return null;
  if ((f.shippedChanged as number) > (f.shippedRows as number)) return null;
  return f as unknown as RescoreSummary;
}
