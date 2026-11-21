// The frozen eval set and its runs (plan Task 29). Labels say what the rules require for each item and
// destination; a run says what each path answered. The public copy of a run has no label text or names.
import type { ItemRead } from "../shared/itemRead";

export type Level = "ok" | "check" | "take_out";

// changes: how the published copy differs from the original (an attribution license asks for this).
// fileUrl: the exact file the original was downloaded from, when it came from a public page.
export interface Provenance { sourcePage: string; author: string; license: string; licenseUrl: string; changes: string; fileUrl?: string }

export interface EvalItem {
  itemId: string;
  photo: string;
  photoSha256: string;
  hazard: boolean;
  printed: { volts: number; milliampHours: number; wattHours: number } | null;
  truth: Record<string, { expected: Level; section: string }>;
  provenance: Provenance;
}

export interface EvalSet { setId: string; manifestSha256: string; protocolSha256: string; destinations: string[]; items: EvalItem[] }

// noItem: the read named no item, so the Pack page would add no card; its level means nothing, but its numbers and
// its time still count.
export interface PathResult { read: ItemRead; msRuns: number[]; level: Level; noItem?: true }
export interface PublicPathResult { numbersExact: boolean | null; msRuns: number[]; level: Level; noItem?: true }

export interface EvalRow {
  itemId: string;
  destination: string;
  device: PathResult | null;
  cloud: PathResult | null;
  shipped: { level: Level; source: string; secondLook: boolean };
}

// Shipped sources that mean the Pack page shows no verdict at all (it adds no card): the read failed, was not run,
// found no item, or ran past the page's time limit. Such a row is never agreement and never "Check this".
export const NO_VERDICT_SOURCES: readonly string[] = ["failed", "not_run", "no_item", "too_slow"];
export const hasVerdict = (r: Pick<EvalRow, "shipped">): boolean => !NO_VERDICT_SOURCES.includes(r.shipped.source);

export interface EvalRun { runId: string; setId: string; date: string; machine: string; chromeVersion: string; modelShown: string; editionId: string; rows: EvalRow[] }

export type PublicEvalRow = Omit<EvalRow, "device" | "cloud"> & { device: PublicPathResult | null; cloud: PublicPathResult | null };
export type PublicEvalRun = Omit<EvalRun, "rows"> & { rows: PublicEvalRow[] };
