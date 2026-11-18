// Loads and checks a rule edition. Strict on purpose: unknown keys on rules and destination
// lines are refused, so no field holding USPS wording can enter an edition.
import { ITEM_CATEGORIES } from "../shared/itemRead";
import type { DestinationContext, DestinationEdition, RuleEdition } from "./types";

export class EditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditionError";
  }
}

type Obj = Record<string, unknown>;

const fail = (where: string, why: string): never => {
  throw new EditionError(`${where}: ${why}`);
};

function obj(v: unknown, where: string): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(where, "expected an object");
  return v as Obj;
}

function keys(o: Obj, required: readonly string[], optional: readonly string[], where: string): void {
  for (const k of Object.keys(o)) {
    if (!required.includes(k) && !optional.includes(k)) fail(`${where}.${k}`, "unknown field");
  }
  for (const k of required) if (!(k in o)) fail(`${where}.${k}`, "missing");
}

function str(v: unknown, where: string): string {
  if (typeof v !== "string" || v.trim() === "") fail(where, "expected a non-empty string");
  return v as string;
}

function num(v: unknown, where: string): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) fail(where, "expected a number above 0");
  return v as number;
}

function bool(v: unknown, where: string): void {
  if (typeof v !== "boolean") fail(where, "expected true or false");
}

function oneOf<T extends string>(v: unknown, values: readonly T[], where: string): T {
  if (typeof v !== "string" || !values.includes(v as T)) fail(where, `expected one of ${values.join(", ")}`);
  return v as T;
}

function https(v: unknown, where: string): void {
  if (!/^https:\/\/[^\s]+$/.test(str(v, where))) fail(where, "expected an https URL");
}

function isoDate(v: unknown, where: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str(v, where))) fail(where, "expected a YYYY-MM-DD date");
}

function list(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) fail(where, "expected a list");
  return v as unknown[];
}

function sha(v: unknown, where: string): void {
  if (!/^[0-9a-f]{64}$/.test(str(v, where))) fail(where, "expected a sha256 hex digest");
}

function checkPredicate(v: unknown, where: string): void {
  const p = obj(v, where);
  if ("all" in p || "any" in p) {
    const k = "all" in p ? "all" : "any";
    keys(p, [k], [], where);
    const items = list(p[k], `${where}.${k}`);
    if (items.length === 0) fail(`${where}.${k}`, "empty");
    items.forEach((x, i) => checkPredicate(x, `${where}.${k}[${i}]`));
    return;
  }
  if ("not" in p) {
    keys(p, ["not"], [], where);
    checkPredicate(p.not, `${where}.not`);
    return;
  }
  keys(p, ["fact", "op", "value"], [], where);
  str(p.fact, `${where}.fact`);
  const op = oneOf(p.op, ["eq", "in", "has", "gt", "lte"] as const, `${where}.op`);
  if (op === "in") list(p.value, `${where}.value`);
  if ((op === "gt" || op === "lte") && typeof p.value !== "number") fail(`${where}.value`, "expected a number");
}

function checkDestination(code: string, v: unknown, questionIds: Set<string>): void {
  const where = `destinations.${code}`;
  const d = obj(v, where);
  keys(d, ["code", "name", "immUrl", "immEdition", "pageSha256", "reviewed", "checkedOn", "noListFurnished",
    "lines", "customsChecked", "customsNotes"], [], where);
  if (d.code !== code) fail(`${where}.code`, "must equal its key");
  str(d.name, `${where}.name`);
  https(d.immUrl, `${where}.immUrl`);
  isoDate(d.immEdition, `${where}.immEdition`);
  sha(d.pageSha256, `${where}.pageSha256`);
  bool(d.reviewed, `${where}.reviewed`);
  if (d.checkedOn !== null) isoDate(d.checkedOn, `${where}.checkedOn`);
  bool(d.noListFurnished, `${where}.noListFurnished`);
  bool(d.customsChecked, `${where}.customsChecked`);
  list(d.customsNotes, `${where}.customsNotes`).forEach((n, i) => str(n, `${where}.customsNotes[${i}]`));
  list(d.lines, `${where}.lines`).forEach((x, i) => {
    const lw = `${where}.lines[${i}]`;
    const line = obj(x, lw);
    keys(line, ["lineId", "section", "lineSha256", "ourWording", "matches"], [], lw);
    str(line.lineId, `${lw}.lineId`);
    oneOf(line.section, ["prohibitions", "restrictions", "observations"] as const, `${lw}.section`);
    sha(line.lineSha256, `${lw}.lineSha256`);
    str(line.ourWording, `${lw}.ourWording`);
    list(line.matches, `${lw}.matches`).forEach((y, j) => {
      const mw = `${lw}.matches[${j}]`;
      const m = obj(y, mw);
      keys(m, ["tag", "effect"], ["unlessAnswer"], mw);
      str(m.tag, `${mw}.tag`);
      oneOf(m.effect, ["take_out", "check"] as const, `${mw}.effect`);
      if (m.unlessAnswer !== undefined) {
        const u = obj(m.unlessAnswer, `${mw}.unlessAnswer`);
        keys(u, ["questionId", "answerId"], [], `${mw}.unlessAnswer`);
        if (!questionIds.has(str(u.questionId, `${mw}.unlessAnswer.questionId`))) {
          fail(`${mw}.unlessAnswer.questionId`, "not a known question");
        }
        str(u.answerId, `${mw}.unlessAnswer.answerId`);
      }
    });
  });
}

export function parseEdition(json: unknown): RuleEdition {
  const e = obj(json, "edition");
  keys(e, ["editionId", "service", "sources", "limits", "categoryTags", "labelWords", "questions", "rules",
    "destinations", "suspensions", "stopWords", "worksheetFields"], [], "edition");
  str(e.editionId, "editionId");
  if (e.service !== "Priority Mail International") fail("service", "must be Priority Mail International");

  list(e.sources, "sources").forEach((x, i) => {
    const s = obj(x, `sources[${i}]`);
    keys(s, ["id", "title", "edition", "url", "checkedOn"], [], `sources[${i}]`);
    oneOf(s.id, ["usps_export", "suspensions", "stop_words_eu", "stop_words_uk"] as const, `sources[${i}].id`);
    str(s.title, `sources[${i}].title`);
    str(s.edition, `sources[${i}].edition`);
    https(s.url, `sources[${i}].url`);
    isoDate(s.checkedOn, `sources[${i}].checkedOn`);
  });

  const l = obj(e.limits, "limits");
  keys(l, ["maxCells", "maxBatteries", "cellMaxWh", "batteryMaxWh", "cellMaxLithiumG", "batteryMaxLithiumG",
    "seriesVoltsThreshold", "whTolerancePct", "mixedOutcome", "unknownCountPolicy", "staleDays"], [], "limits");
  for (const k of ["maxCells", "maxBatteries", "cellMaxWh", "batteryMaxWh", "cellMaxLithiumG", "batteryMaxLithiumG",
    "seriesVoltsThreshold", "whTolerancePct"]) num(l[k], `limits.${k}`);
  // 3.8% is the measured misread (2600 read as 2500 mAh beside 9.62 Wh); the tolerance must stay below it.
  if ((l.whTolerancePct as number) >= 3.8) fail("limits.whTolerancePct", "must stay below 3.8");
  oneOf(l.mixedOutcome, ["check", "take_out"] as const, "limits.mixedOutcome");
  oneOf(l.unknownCountPolicy, ["ask", "assume_cell"] as const, "limits.unknownCountPolicy");
  const sd = obj(l.staleDays, "limits.staleDays");
  keys(sd, ["usps_export", "destination", "suspensions", "customs"], [], "limits.staleDays");
  for (const k of Object.keys(sd)) num(sd[k], `limits.staleDays.${k}`);

  const ct = obj(e.categoryTags, "categoryTags");
  keys(ct, ITEM_CATEGORIES, [], "categoryTags");
  for (const c of ITEM_CATEGORIES) list(ct[c], `categoryTags.${c}`).forEach((t, i) => str(t, `categoryTags.${c}[${i}]`));

  list(e.labelWords, "labelWords").forEach((x, i) => {
    const w = obj(x, `labelWords[${i}]`);
    keys(w, ["pattern", "tag"], [], `labelWords[${i}]`);
    try {
      new RegExp(str(w.pattern, `labelWords[${i}].pattern`), "i");
    } catch {
      fail(`labelWords[${i}].pattern`, "not a valid pattern");
    }
    str(w.tag, `labelWords[${i}].tag`);
  });

  const questionIds = new Set<string>();
  list(e.questions, "questions").forEach((x, i) => {
    const q = obj(x, `questions[${i}]`);
    keys(q, ["id", "text", "answers"], [], `questions[${i}]`);
    const id = str(q.id, `questions[${i}].id`);
    if (questionIds.has(id)) fail(`questions[${i}].id`, "duplicate");
    questionIds.add(id);
    str(q.text, `questions[${i}].text`);
    const answers = list(q.answers, `questions[${i}].answers`);
    if (answers.length < 2) fail(`questions[${i}].answers`, "needs at least two answers");
    answers.forEach((y, j) => {
      const a = obj(y, `questions[${i}].answers[${j}]`);
      keys(a, ["id", "label"], [], `questions[${i}].answers[${j}]`);
      str(a.id, `questions[${i}].answers[${j}].id`);
      str(a.label, `questions[${i}].answers[${j}].label`);
    });
  });

  const ruleIds = new Set<string>();
  list(e.rules, "rules").forEach((x, i) => {
    const w = `rules[${i}]`;
    const r = obj(x, w);
    keys(r, ["id", "layer", "scope", "section", "url", "basis", "ourWording", "when", "outcome"], ["askId"], w);
    const id = str(r.id, `${w}.id`);
    if (ruleIds.has(id)) fail(`${w}.id`, "duplicate");
    ruleIds.add(id);
    oneOf(r.layer, ["usps_export", "data"] as const, `${w}.layer`);
    oneOf(r.scope, ["item", "box", "note"] as const, `${w}.scope`);
    str(r.section, `${w}.section`);
    https(r.url, `${w}.url`);
    oneOf(r.basis, ["summarized", "inference", "estimate"] as const, `${w}.basis`);
    str(r.ourWording, `${w}.ourWording`);
    checkPredicate(r.when, `${w}.when`);
    oneOf(r.outcome, ["take_out", "check", "note"] as const, `${w}.outcome`);
    if (r.askId !== undefined && !questionIds.has(str(r.askId, `${w}.askId`))) fail(`${w}.askId`, "not a known question");
  });

  const dests = obj(e.destinations, "destinations");
  for (const [code, d] of Object.entries(dests)) checkDestination(code, d, questionIds);

  const s = obj(e.suspensions, "suspensions");
  keys(s, ["updated", "checkedOn", "url", "codes"], [], "suspensions");
  isoDate(s.updated, "suspensions.updated");
  isoDate(s.checkedOn, "suspensions.checkedOn");
  https(s.url, "suspensions.url");
  list(s.codes, "suspensions.codes").forEach((c, i) => {
    if (typeof c !== "string" || !/^[A-Z]{2}$/.test(c)) fail(`suspensions.codes[${i}]`, "expected a two-letter code");
  });

  list(e.stopWords, "stopWords").forEach((w, i) => str(w, `stopWords[${i}]`));
  list(e.worksheetFields, "worksheetFields").forEach((x, i) => {
    const f = obj(x, `worksheetFields[${i}]`);
    keys(f, ["id", "label", "kind", "source", "verified"], [], `worksheetFields[${i}]`);
    str(f.id, `worksheetFields[${i}].id`);
    str(f.label, `worksheetFields[${i}].label`);
    oneOf(f.kind, ["blank", "box", "item_column"] as const, `worksheetFields[${i}].kind`);
    str(f.source, `worksheetFields[${i}].source`);
    bool(f.verified, `worksheetFields[${i}].verified`);
  });

  return structuredClone(json) as RuleEdition;
}

// Sorted keys at every depth, so the same content always gives the same text and hash.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Obj)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function editionSha256(e: RuleEdition): Promise<string> {
  return sha256Hex(canonicalJson(e));
}

export function resolveDestination(e: RuleEdition, code: string, live?: DestinationEdition): DestinationContext {
  const suspended = e.suspensions.codes.includes(code);
  const stored = e.destinations[code] ?? null;
  const edition = stored ?? live ?? null;
  let reviewState: DestinationContext["reviewState"] = "not_loaded";
  if (edition) {
    if (edition.noListFurnished) reviewState = "no_list_furnished";
    else if (stored && stored.reviewed) reviewState = "reviewed";
    else reviewState = "live_unreviewed";
  }
  return { code, name: edition?.name ?? code, reviewState, suspended, edition };
}
