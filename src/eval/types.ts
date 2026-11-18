// The frozen eval set and its runs (plan Task 29). Labels say what the rules require for each item and
// destination; a run says what each path answered. The public copy of a run has no label text or names.
import type { ItemRead } from "../shared/itemRead";

export type Level = "ok" | "check" | "take_out";

export interface Provenance { sourcePage: string; author: string; license: string; licenseUrl: string }

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

export interface PathResult { read: ItemRead; msRuns: number[]; level: Level }
export interface PublicPathResult { numbersExact: boolean | null; msRuns: number[]; level: Level }

export interface EvalRow {
  itemId: string;
  destination: string;
  device: PathResult | null;
  cloud: PathResult | null;
  shipped: { level: Level; source: string; secondLook: boolean };
}

export interface EvalRun { runId: string; setId: string; date: string; machine: string; chromeVersion: string; modelShown: string; editionId: string; rows: EvalRow[] }

export type PublicEvalRow = Omit<EvalRow, "device" | "cloud"> & { device: PublicPathResult | null; cloud: PublicPathResult | null };
export type PublicEvalRun = Omit<EvalRun, "rows"> & { rows: PublicEvalRow[] };
