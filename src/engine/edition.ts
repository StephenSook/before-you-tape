// Loads and checks a rule edition. Strict on purpose: unknown keys on rules and destination
// lines are refused, so no field holding USPS wording can enter an edition.
import { ITEM_CATEGORIES } from "../shared/itemRead";
import { ENGINE_TAGS } from "./facts";
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

// True only for a YYYY-MM-DD date that exists on the calendar (no month 13, no February 30).
export function isCalendarDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

function isoDate(v: unknown, where: string): void {
  if (!isCalendarDate(str(v, where))) fail(where, "expected a real YYYY-MM-DD date");
}

function list(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) fail(where, "expected a list");
  return v as unknown[];
}

function sha(v: unknown, where: string): void {
  if (!/^[0-9a-f]{64}$/.test(str(v, where))) fail(where, "expected a sha256 hex digest");
}

const REQUIRED_QUESTIONS = ["label_alcohol", "device_condition", "battery_installed"] as const;

// Every fact path a predicate may read. A typo here would make a rule that never fires.
const KNOWN_FACTS: ReadonlySet<string> = new Set([
  "category", "tags", "evidence", "identity", "condition", "alcohol", "quantity",
  "battery.presence", "battery.chemistry", "battery.volts", "battery.milliampHours", "battery.whPrinted",
  "battery.whComputed", "battery.whStatus", "battery.wh", "battery.lithiumGrams", "battery.countAs", "battery.units",
]);

function checkPredicate(v: unknown, where: string, producible: ReadonlySet<string>): void {
  const p = obj(v, where);
  if ("all" in p || "any" in p) {
    const k = "all" in p ? "all" : "any";
    keys(p, [k], [], where);
    const items = list(p[k], `${where}.${k}`);
    if (items.length === 0) fail(`${where}.${k}`, "empty");
    items.forEach((x, i) => checkPredicate(x, `${where}.${k}[${i}]`, producible));
    return;
  }
  if ("not" in p) {
    keys(p, ["not"], [], where);
    checkPredicate(p.not, `${where}.not`, producible);
    return;
  }
  keys(p, ["fact", "op", "value"], [], where);
  if (!KNOWN_FACTS.has(str(p.fact, `${where}.fact`))) fail(`${where}.fact`, `no such fact: ${String(p.fact)}`);
  const op = oneOf(p.op, ["eq", "in", "has", "gt", "lte"] as const, `${where}.op`);
  if (op === "in") list(p.value, `${where}.value`);
  if ((op === "gt" || op === "lte") && typeof p.value !== "number") fail(`${where}.value`, "expected a number");
  if (p.fact === "tags" && op === "has" && !producible.has(String(p.value))) {
    fail(`${where}.value`, `no category, label word or engine rule produces the tag ${String(p.value)}`);
  }
}

function checkDestination(
  code: string, v: unknown, questions: ReadonlyMap<string, ReadonlySet<string>>, producible: ReadonlySet<string>,
): void {
  const where = `destinations.${code}`;
  const d = obj(v, where);
  keys(d, ["code", "name", "immUrl", "immEdition", "pageSha256", "reviewed", "checkedOn", "personReviewedOn",
    "noListFurnished", "lines", "customsChecked", "customsNotes"], [], where);
  if (d.code !== code) fail(`${where}.code`, "must equal its key");
  str(d.name, `${where}.name`);
  https(d.immUrl, `${where}.immUrl`);
  isoDate(d.immEdition, `${where}.immEdition`);
  sha(d.pageSha256, `${where}.pageSha256`);
  bool(d.reviewed, `${where}.reviewed`);
  if (d.checkedOn !== null) isoDate(d.checkedOn, `${where}.checkedOn`);
  if (d.personReviewedOn !== null) isoDate(d.personReviewedOn, `${where}.personReviewedOn`);
  bool(d.noListFurnished, `${where}.noListFurnished`);
  bool(d.customsChecked, `${where}.customsChecked`);
  list(d.customsNotes, `${where}.customsNotes`).forEach((n, i) => str(n, `${where}.customsNotes[${i}]`));
  // A reviewed listing with no lines would report the destination as checked while checking nothing.
  if (d.reviewed && !d.noListFurnished && list(d.lines, `${where}.lines`).length === 0) {
    fail(`${where}.lines`, "a reviewed listing needs its lines, or noListFurnished");
  }
  list(d.lines, `${where}.lines`).forEach((x, i) => {
    const lw = `${where}.lines[${i}]`;
    const line = obj(x, lw);
    keys(line, ["lineId", "section", "lineSha256", "ourWording", "matches"], ["noMatch"], lw);
    str(line.lineId, `${lw}.lineId`);
    oneOf(line.section, ["prohibitions", "restrictions", "observations"] as const, `${lw}.section`);
    sha(line.lineSha256, `${lw}.lineSha256`);
    str(line.ourWording, `${lw}.ourWording`);
    const matches = list(line.matches, `${lw}.matches`);
    // Every line either matches item tags or records why it matches nothing; never neither, never both.
    if (matches.length === 0) {
      if (line.noMatch === undefined) fail(`${lw}.noMatch`, "a line with no matches needs a recorded decision");
      const nm = obj(line.noMatch, `${lw}.noMatch`);
      keys(nm, ["decision", "reason"], [], `${lw}.noMatch`);
      oneOf(nm.decision, ["not_a_gift_item", "exception_to_line", "cannot_judge_from_photo", "observation"] as const,
        `${lw}.noMatch.decision`);
      str(nm.reason, `${lw}.noMatch.reason`);
    } else if (line.noMatch !== undefined) {
      fail(`${lw}.noMatch`, "a line that matches tags cannot also record no match");
    }
    matches.forEach((y, j) => {
      const mw = `${lw}.matches[${j}]`;
      const m = obj(y, mw);
      keys(m, ["tag", "effect"], ["unlessAnswer"], mw);
      if (!producible.has(str(m.tag, `${mw}.tag`))) {
        fail(`${mw}.tag`, `no category, label word or engine rule produces the tag ${String(m.tag)}`);
      }
      oneOf(m.effect, ["take_out", "check"] as const, `${mw}.effect`);
      if (m.unlessAnswer !== undefined) {
        const u = obj(m.unlessAnswer, `${mw}.unlessAnswer`);
        keys(u, ["questionId", "answerId"], [], `${mw}.unlessAnswer`);
        const answers = questions.get(str(u.questionId, `${mw}.unlessAnswer.questionId`));
        if (!answers) fail(`${mw}.unlessAnswer.questionId`, "not a known question");
        if (!answers?.has(str(u.answerId, `${mw}.unlessAnswer.answerId`))) {
          fail(`${mw}.unlessAnswer.answerId`, "not an answer that question offers");
        }
      }
    });
  });
}

export function parseEdition(json: unknown): RuleEdition {
  const e = obj(json, "edition");
  keys(e, ["editionId", "service", "sources", "limits", "categoryTags", "labelWords", "questions", "rules",
    "destinations", "suspensions", "stopWords", "worksheetFields"], ["revision"], "edition");
  str(e.editionId, "editionId");
  // Which edition is newer: a pinned edition is used only when its revision is higher than the built-in one's.
  if (e.revision !== undefined && !(typeof e.revision === "number" && Number.isInteger(e.revision) && e.revision >= 1)) {
    fail("revision", "must be a whole number from 1");
  }
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

  // Every tag an item can carry: category tags, label word tags and the tags the engine adds itself.
  const producible = new Set<string>(ENGINE_TAGS);
  for (const c of ITEM_CATEGORIES) for (const t of ct[c] as string[]) producible.add(t);
  for (const w of e.labelWords as Obj[]) producible.add(w.tag as string);

  const questions = new Map<string, Set<string>>();
  list(e.questions, "questions").forEach((x, i) => {
    const q = obj(x, `questions[${i}]`);
    keys(q, ["id", "text", "answers"], [], `questions[${i}]`);
    const id = str(q.id, `questions[${i}].id`);
    if (questions.has(id)) fail(`questions[${i}].id`, "duplicate");
    const answerIds = new Set<string>();
    questions.set(id, answerIds);
    str(q.text, `questions[${i}].text`);
    const answers = list(q.answers, `questions[${i}].answers`);
    if (answers.length < 2) fail(`questions[${i}].answers`, "needs at least two answers");
    answers.forEach((y, j) => {
      const a = obj(y, `questions[${i}].answers[${j}]`);
      keys(a, ["id", "label"], [], `questions[${i}].answers[${j}]`);
      answerIds.add(str(a.id, `questions[${i}].answers[${j}].id`));
      str(a.label, `questions[${i}].answers[${j}].label`);
    });
  });

  // One rule id may ask several questions (DATA-NEEDS-ANSWER), so the unique key is id plus askId.
  const ruleKeys = new Set<string>();
  list(e.rules, "rules").forEach((x, i) => {
    const w = `rules[${i}]`;
    const r = obj(x, w);
    keys(r, ["id", "layer", "scope", "section", "url", "basis", "ourWording", "when", "outcome"], ["askId"], w);
    const key = `${str(r.id, `${w}.id`)}|${typeof r.askId === "string" ? r.askId : ""}`;
    if (ruleKeys.has(key)) fail(`${w}.id`, "duplicate");
    ruleKeys.add(key);
    oneOf(r.layer, ["usps_export", "data"] as const, `${w}.layer`);
    oneOf(r.scope, ["item", "box", "note"] as const, `${w}.scope`);
    str(r.section, `${w}.section`);
    https(r.url, `${w}.url`);
    oneOf(r.basis, ["summarized", "inference", "estimate"] as const, `${w}.basis`);
    str(r.ourWording, `${w}.ourWording`);
    checkPredicate(r.when, `${w}.when`, producible);
    oneOf(r.outcome, ["take_out", "check", "note"] as const, `${w}.outcome`);
    if (r.askId !== undefined && !questions.has(str(r.askId, `${w}.askId`))) fail(`${w}.askId`, "not a known question");
  });
  // A rule blocks "OK to pack" only as an item rule with a check or take-out outcome; a note or a
  // box-scoped copy would load and then never stop anything.
  const blocks = (r: Obj) => r.scope === "item" && (r.outcome === "check" || r.outcome === "take_out");
  // An edition with no export rules would report the export layer as checked while checking nothing.
  if (!(e.rules as Obj[]).some((r) => r.layer === "usps_export" && blocks(r))) {
    fail("rules", "the edition has no USPS export item rule that can block a verdict");
  }
  // "Every required question is answered" is an OK precondition, so its question rules cannot be dropped.
  for (const askId of REQUIRED_QUESTIONS) {
    if (!(e.rules as Obj[]).some((r) => r.id === "DATA-NEEDS-ANSWER" && r.askId === askId && blocks(r))) {
      fail("rules", `the edition must ask ${askId} through a DATA-NEEDS-ANSWER item rule that can block a verdict`);
    }
  }

  const dests = obj(e.destinations, "destinations");
  for (const [code, d] of Object.entries(dests)) checkDestination(code, d, questions, producible);

  const s = obj(e.suspensions, "suspensions");
  keys(s, ["updated", "checkedOn", "url", "codes"], ["upcoming"], "suspensions");
  isoDate(s.updated, "suspensions.updated");
  isoDate(s.checkedOn, "suspensions.checkedOn");
  https(s.url, "suspensions.url");
  list(s.codes, "suspensions.codes").forEach((c, i) => {
    if (typeof c !== "string" || !/^[A-Z]{2}$/.test(c)) fail(`suspensions.codes[${i}]`, "expected a two-letter code");
  });
  if (s.upcoming !== undefined) list(s.upcoming, "suspensions.upcoming").forEach((x, i) => {
    const u = obj(x, `suspensions.upcoming[${i}]`);
    keys(u, ["code", "from"], [], `suspensions.upcoming[${i}]`);
    if (typeof u.code !== "string" || !/^[A-Z]{2}$/.test(u.code)) fail(`suspensions.upcoming[${i}].code`, "expected a two-letter code");
    isoDate(u.from, `suspensions.upcoming[${i}].from`);
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

// today (YYYY-MM-DD) decides an announced suspension: suspended from its date, and before it noted with the
// date it starts. Without today (a page that lists a country's rules), only the current list counts.
export function resolveDestination(e: RuleEdition, code: string, live?: DestinationEdition, today?: string): DestinationContext {
  const ahead = today === undefined ? undefined : e.suspensions.upcoming?.find((u) => u.code === code);
  const started = ahead !== undefined && today !== undefined && today >= ahead.from;
  const suspended = e.suspensions.codes.includes(code) || started;
  const stored = e.destinations[code] ?? null;
  const edition = stored ?? live ?? null;
  let reviewState: DestinationContext["reviewState"] = "not_loaded";
  if (edition) {
    if (edition.noListFurnished) reviewState = "no_list_furnished";
    else if (stored && stored.reviewed) reviewState = "reviewed";
    else reviewState = "live_unreviewed";
  }
  return { code, name: edition?.name ?? code, reviewState, suspended, ...(ahead && !suspended ? { suspendsFrom: ahead.from } : {}), edition };
}
