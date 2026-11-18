// Rules engine types. Pure data: nothing here imports Firebase or the AI layer.
import type { ItemCategory, ItemRead } from "../shared/itemRead";

export type { ItemCategory, ItemRead };

export interface BatteryFacts {
  presence: "none" | "installed" | "loose" | "packed_beside" | "unknown";
  chemistry: "li_ion" | "li_metal" | "unknown";
  volts: number | null;
  milliampHours: number | null;
  whPrinted: number | null;
  whComputed: number | null;
  whStatus: "printed_matches" | "printed_mismatch" | "printed_only" | "computed_only" | "none" | "implausible";
  wh: number | null; // set only for printed_matches and printed_only
  countAs: "cell" | "battery" | "unknown";
  units: number;
}

export interface LithiumLimits {
  maxCells: number;
  maxBatteries: number;
  cellMaxWh: number;
  batteryMaxWh: number;
  cellMaxLithiumG: number;
  batteryMaxLithiumG: number;
  seriesVoltsThreshold: number;
  whTolerancePct: number;
  mixedOutcome: "check" | "take_out";
  unknownCountPolicy: "ask" | "assume_cell";
  staleDays: { usps_export: number; destination: number; suspensions: number; customs: number };
}

export type Predicate =
  | { all: Predicate[] }
  | { any: Predicate[] }
  | { not: Predicate }
  | { fact: string; op: "eq" | "in" | "has" | "gt" | "lte"; value: unknown };

export interface Rule {
  id: string;
  layer: "usps_export" | "data";
  scope: "item" | "box" | "note";
  section: string;
  url: string;
  basis: "summarized" | "inference" | "estimate";
  ourWording: string;
  when: Predicate;
  outcome: "take_out" | "check" | "note";
  askId?: string;
}

export interface DestinationLineMatch {
  tag: string;
  effect: "take_out" | "check";
  unlessAnswer?: { questionId: string; answerId: string };
}

export interface DestinationLine {
  lineId: string;
  section: "prohibitions" | "restrictions" | "observations";
  lineSha256: string;
  ourWording: string;
  matches: DestinationLineMatch[];
}

export interface DestinationEdition {
  code: string;
  name: string;
  immUrl: string;
  immEdition: string;
  pageSha256: string;
  reviewed: boolean;
  checkedOn: string | null;
  noListFurnished: boolean;
  lines: DestinationLine[];
  customsChecked: boolean;
  customsNotes: string[];
}

export type SourceId = "usps_export" | "suspensions" | "stop_words_eu" | "stop_words_uk";

export interface EditionSource {
  id: SourceId;
  title: string;
  edition: string;
  url: string;
  checkedOn: string;
}

export interface Question {
  id: string;
  text: string;
  answers: Array<{ id: string; label: string }>;
}

// Task 3 produces this order; until spike S3 reads the forms, entries carry verified: false.
export interface WorksheetFieldSpec {
  id: string;
  label: string;
  kind: "blank" | "box" | "item_column";
  source: string;
  verified: boolean;
}

export interface RuleEdition {
  editionId: string;
  service: "Priority Mail International";
  sources: EditionSource[];
  limits: LithiumLimits;
  categoryTags: Record<ItemCategory, string[]>;
  labelWords: Array<{ pattern: string; tag: string }>;
  questions: Question[];
  rules: Rule[];
  destinations: Record<string, DestinationEdition>;
  suspensions: { updated: string; checkedOn: string; url: string; codes: string[] };
  stopWords: string[];
  worksheetFields: WorksheetFieldSpec[];
}

export type ItemAnswers = Record<string, string>;

export interface BoxItemInput {
  itemId: string;
  read: ItemRead;
  overrides: Partial<ItemRead>;
  answers: ItemAnswers;
  quantity: number;
  identityConfirmedBy: "sender" | "second_look" | null;
  labelTags: string[];
}

export interface ItemFacts {
  category: ItemCategory;
  tags: string[];
  evidence: ItemRead["evidence"];
  identity: "label" | "sender" | "second_look" | "unconfirmed";
  battery: BatteryFacts;
  condition: "new_sealed" | "new_opened" | "used" | "refurbished_certified" | "unknown";
  alcohol: "yes" | "no" | "unknown";
  quantity: number;
}

export type VerdictLevel = "ok" | "check" | "take_out";

export interface RuleHit {
  ruleId: string;
  layer: "usps_export" | "box" | "destination" | "data";
  level: "check" | "take_out" | "note";
  text: string;
  section: string;
  url: string;
  askId?: string;
}

export interface LayerStatus {
  id: "usps_export" | "destination" | "suspensions" | "customs";
  label: string;
  edition: string;
  checkedOn: string | null;
  state: "checked" | "missing" | "stale";
}

export interface ItemVerdict {
  level: VerdictLevel;
  headline: string;
  hits: RuleHit[];
  question: Question | null;
  layers: LayerStatus[];
  service: string;
}

export interface DestinationContext {
  code: string;
  name: string;
  reviewState: "reviewed" | "live_unreviewed" | "not_loaded" | "no_list_furnished";
  suspended: boolean;
  edition: DestinationEdition | null;
}
