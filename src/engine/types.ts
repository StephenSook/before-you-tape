// Rules engine types. Pure data: nothing here imports Firebase or the AI layer.
import type { ItemCategory, ItemRead } from "../shared/itemRead";

export type { ItemCategory, ItemRead };

export interface BatteryFacts {
  presence: "none" | "installed" | "loose" | "packed_beside" | "unknown";
  chemistry: "li_ion" | "li_metal" | "not_lithium" | "unknown"; // not_lithium only from the sender's answer
  volts: number | null;
  milliampHours: number | null;
  whPrinted: number | null;
  whComputed: number | null;
  whStatus: "printed_matches" | "printed_mismatch" | "printed_only" | "computed_only" | "none" | "implausible";
  wh: number | null; // set only for printed_matches and printed_only
  lithiumGrams: number | null; // printed lithium content (lithium metal), null when not printed
  countAs: "cell" | "battery" | "unknown";
  units: number;
  // Where the battery numbers present came from: all typed by the sender, all from a model read, or both.
  numbersFrom: "read" | "typed" | "mixed";
  // A Wh or lithium-grams figure the label text names that a read number it was not typed over disagrees with.
  // read is the number in use (null when there is none); typed says the sender typed it.
  labelMismatch: { kind: "wh" | "grams"; label: number; read: number | null; typed: boolean } | null;
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

// Why a listing line maps to no item tag. Required whenever matches is empty, so every
// line is either checked against items or carries a recorded, reviewable decision.
export type NoMatchDecision = "not_a_gift_item" | "exception_to_line" | "cannot_judge_from_photo" | "observation";

export interface DestinationLine {
  lineId: string;
  section: "prohibitions" | "restrictions" | "observations";
  lineSha256: string;
  ourWording: string;
  matches: DestinationLineMatch[];
  noMatch?: { decision: NoMatchDecision; reason: string };
}

export interface DestinationEdition {
  code: string;
  name: string;
  immUrl: string;
  immEdition: string;
  pageSha256: string;
  reviewed: boolean; // the builder read every line on the live page and wrote our wording
  checkedOn: string | null; // date of that read
  personReviewedOn: string | null; // date a person re-read every line against our wording; null until then
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
  // Higher is newer; an edition from before revisions has none.
  revision?: number;
  service: "Priority Mail International";
  sources: EditionSource[];
  limits: LithiumLimits;
  categoryTags: Record<ItemCategory, string[]>;
  labelWords: Array<{ pattern: string; tag: string }>;
  questions: Question[];
  rules: Rule[];
  destinations: Record<string, DestinationEdition>;
  // codes: suspended now. upcoming: suspensions the post office has announced for a later date (ISO "from").
  suspensions: { updated: string; checkedOn: string; url: string; codes: string[]; upcoming?: Array<{ code: string; from: string }> };
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
  // Facts the two reads of a second look disagreed on. While one is open the item is at least "Check this".
  disputes?: ReadDisputes;
  // "typed" when the whole read is the sender's own (a typed item). Left out, the read is a model's: the safe side.
  numbersFrom?: "typed" | "read";
  // The Wh and lithium-grams figures the label named when it was read, kept because the label text is not. Left
  // out, they are taken from the read's label text.
  labelFigures?: { wh: number[]; grams: number[] };
}

// The facts two reads can disagree on, each of which can change a verdict, with the value type of each.
// A label dispute holds the tags each read's label gave, never label text.
export interface DisputeValues {
  category: ItemCategory;
  retailBox: ItemRead["retailBox"];
  battery: { volts: number; milliampHours: number; wattHours: number };
  lithiumGrams: number;
  batteryWords: boolean;
  liquid: boolean;
  pressurized: boolean;
  alcoholOnLabel: boolean;
  flammableOnLabel: boolean;
  glassContainer: boolean;
  powder: boolean;
  labelTags: string[];
  // How each read saw the item: a first read that was not sure is a fact the cloud cannot erase.
  evidence: ItemRead["evidence"];
}
export type DisputeField = keyof DisputeValues;
export interface ReadDispute<T> { device: T; cloud: T; resolved: boolean }
export type ReadDisputes = { [F in DisputeField]?: ReadDispute<DisputeValues[F]> };

export const DISPUTE_FIELDS: readonly DisputeField[] = [
  "category", "retailBox", "battery", "lithiumGrams", "batteryWords", "liquid", "pressurized", "alcoholOnLabel",
  "flammableOnLabel", "glassContainer", "powder", "labelTags", "evidence",
];

// The disputes the sender has not settled yet, in a fixed order.
export function openDisputes(disputes: ReadDisputes | undefined): DisputeField[] {
  return DISPUTE_FIELDS.filter((f) => disputes?.[f] !== undefined && disputes[f]!.resolved !== true);
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
  // The date an announced suspension starts, while it is still ahead of the date the box was judged on.
  suspendsFrom?: string;
  edition: DestinationEdition | null;
}
