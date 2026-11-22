// The rules engine for native clients. scripts/build-embed.sh bundles this file and the engine
// into one script (global BYT) that the Android app runs in QuickJS. Every function takes and
// returns JSON text, {"ok":true,"value":...} or {"ok":false,"error":{"name":...,"message":...}},
// and none throws, so a native host never has to catch a JavaScript exception.
import { canonicalJson, parseEdition, resolveDestination } from "../engine/edition";
import { evaluateDestination } from "../engine/destination";
import { keptLabelFigures, type LabelFigures } from "../engine/battery";
import { deriveFacts, labelTagsOf } from "../engine/facts";
import { DISPUTE_FIELDS, type BoxItemInput, type DestinationEdition, type ItemAnswers, type ItemFacts, type RuleEdition } from "../engine/types";
import { evaluateBox } from "../engine/verdict";
import { ITEM_READ_FIELDS, LABEL_TEXT_MAX, itemReadJsonSchema, parseItemRead, parseItemReadWithLabel, type ItemRead, type ItemReadField } from "../shared/itemRead";
import { isNoItem } from "../shared/noItem";
import { mergeReads, needsSecondLook, readDisputes, SECOND_LOOK_DEFAULT, type SecondLookPolicy } from "../shared/secondLook";

// QuickJS has no structuredClone, and parseEdition uses it. The engine only clones plain data
// (objects, arrays, strings, numbers, booleans, null), so a recursive copy gives what the native
// clone gives there. A JSON round trip would not: it turns Infinity and NaN into null and drops
// keys whose value is undefined, which could change a rule. Anything that is not plain data is
// refused rather than copied wrongly.
function clonePlainData(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "function" || typeof value === "symbol") throw new TypeError("cannot clone a function or a symbol");
    return value;
  }
  if (Array.isArray(value)) return value.map(clonePlainData);
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new TypeError("this structuredClone copies plain data only");
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    // defineProperty, so a key named "__proto__" stays an own key and never sets the prototype.
    Object.defineProperty(out, key, {
      value: clonePlainData((value as Record<string, unknown>)[key]),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return out;
}

const g = globalThis as { structuredClone?: <T>(value: T) => T };
if (typeof g.structuredClone !== "function") {
  g.structuredClone = <T>(value: T): T => clonePlainData(value) as T;
}

export const BRIDGE_VERSION = 1;

class NoEditionError extends Error {
  override name = "NoEditionError";
}
class BadInputError extends Error {
  override name = "BadInputError";
}

let edition: RuleEdition | null = null;

function reply(work: () => unknown): string {
  try {
    return JSON.stringify({ ok: true, value: work() });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return JSON.stringify({ ok: false, error: { name: err.name, message: err.message } });
  }
}

function current(): RuleEdition {
  if (!edition) throw new NoEditionError("no rule edition is loaded; call setEdition first");
  return edition;
}

function object(text: string): Record<string, unknown> {
  const data: unknown = JSON.parse(text);
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new BadInputError("the input is not a JSON object");
  return data as Record<string, unknown>;
}

function plain(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new BadInputError(`${where} must be an object`);
  return v as Record<string, unknown>;
}

// The same rules as the web app's read parser: a number is finite and 0 or more (a value that is
// not printed is 0). typedText: an override a person typed may hold a number field as text; the
// engine itself decides how much to trust typed text (it never takes nonsense as a reading).
function checkField(f: ItemReadField, v: unknown, where: string, typedText = false): void {
  const ok =
    f.kind === "string" ? typeof v === "string"
    : f.kind === "number" ? (typeof v === "number" && Number.isFinite(v) && v >= 0) || (typedText && typeof v === "string")
    : f.kind === "boolean" ? typeof v === "boolean"
    : typeof v === "string" && (f.values ?? []).includes(v);
  if (!ok) throw new BadInputError(`${where}.${f.name} is not a valid ${f.kind}`);
}

const FIELDS = new Map<string, ItemReadField>(ITEM_READ_FIELDS.map((f) => [f.name, f]));
const IDENTITY_SOURCES = new Set(["sender", "second_look"]);

// One model read, field by field. A read's label text is at most LABEL_TEXT_MAX characters (the
// parser clips to it), and the engine tags whatever text it gets, so a longer read could earn tags
// the web app never sees. A label the sender typed (an override) has no such limit, on the web or here.
function checkRead(raw: unknown, where: string): ItemRead {
  const read = plain(raw, where);
  for (const f of ITEM_READ_FIELDS) checkField(f, read[f.name], where);
  if (Array.from(read.labelText as string).length > LABEL_TEXT_MAX) {
    throw new BadInputError(`${where}.labelText is longer than ${LABEL_TEXT_MAX} characters`);
  }
  return read as unknown as ItemRead;
}

const POLICY_KEYS = ["whMismatch", "batteryNumbers", "notSure", "hazardNoLabel", "identity"] as const;

// A second-look policy has exactly its five switches, each true or false; anything else is refused
// rather than read as every reason on.
function checkPolicy(raw: unknown): SecondLookPolicy {
  const o = plain(raw, "policy");
  for (const k of Object.keys(o)) if (!(POLICY_KEYS as readonly string[]).includes(k)) throw new BadInputError(`policy.${k} is not a second-look reason`);
  for (const k of POLICY_KEYS) if (typeof o[k] !== "boolean") throw new BadInputError(`policy.${k} must be true or false`);
  return o as unknown as SecondLookPolicy;
}

// The engine trusts its input types, so a malformed item could read as "OK to pack". Every item
// is checked here first, and a bad one is refused as a whole request.
function checkItems(raw: unknown): BoxItemInput[] {
  if (!Array.isArray(raw)) throw new BadInputError("items must be an array");
  const ids = new Set<string>();
  raw.forEach((entry, i) => {
    const o = plain(entry, `items[${i}]`);
    const id = o.itemId;
    if (typeof id !== "string" || id === "" || id in Object.prototype) throw new BadInputError(`items[${i}].itemId is not a usable id`);
    if (ids.has(id)) throw new BadInputError(`item id ${id} appears twice`);
    ids.add(id);
    checkRead(o.read, `${id}.read`);
    for (const [k, v] of Object.entries(plain(o.overrides, `${id}.overrides`))) {
      const f = FIELDS.get(k);
      if (!f) throw new BadInputError(`${id}.overrides.${k} is not an item-read field`);
      checkField(f, v, `${id}.overrides`, true);
    }
    for (const [k, v] of Object.entries(plain(o.answers, `${id}.answers`))) {
      if (typeof v !== "string") throw new BadInputError(`${id}.answers.${k} must be a string`);
    }
    if (typeof o.quantity !== "number" || !Number.isFinite(o.quantity)) throw new BadInputError(`${id}.quantity must be a finite number`);
    const by = o.identityConfirmedBy;
    if (by !== null && !(typeof by === "string" && IDENTITY_SOURCES.has(by))) {
      throw new BadInputError(`${id}.identityConfirmedBy must be "sender", "second_look" or null`);
    }
    if (!Array.isArray(o.labelTags) || !o.labelTags.every((t) => typeof t === "string")) {
      throw new BadInputError(`${id}.labelTags must be a list of strings`);
    }
    // Optional: the Wh and lithium-grams figures the label named, up to 8 of each, numbers above 0.
    if (o.labelFigures !== undefined) checkLabelFigures(o.labelFigures, `${id}.labelFigures`);
    // Optional. Left out, the numbers count as read, the safe side.
    if (o.numbersFrom !== undefined && o.numbersFrom !== "typed" && o.numbersFrom !== "read") {
      throw new BadInputError(`${id}.numbersFrom must be "typed", "read" or left out`);
    }
    // Optional. Only whether each dispute is settled changes a verdict, so that is what must be well formed.
    if (o.disputes !== undefined) {
      for (const [k, v] of Object.entries(plain(o.disputes, `${id}.disputes`))) {
        if (!(DISPUTE_FIELDS as readonly string[]).includes(k)) throw new BadInputError(`${id}.disputes.${k} is not a fact two reads can dispute`);
        if (typeof plain(v, `${id}.disputes.${k}`).resolved !== "boolean") throw new BadInputError(`${id}.disputes.${k}.resolved must be true or false`);
      }
    }
  });
  return raw as BoxItemInput[];
}

function str(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v !== "string") throw new BadInputError(`${key} must be a string`);
  return v;
}

/** Loads a rule edition (the JSON text of rules/edition.json or a newer edition). */
export function setEdition(editionJson: string): string {
  return reply(() => {
    const parsed = parseEdition(JSON.parse(editionJson));
    edition = parsed;
    const destinations = Object.entries(parsed.destinations)
      .map(([code, d]) => ({ code, name: d.name }))
      .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
    return { editionId: parsed.editionId, destinations };
  });
}

/** The loaded edition with sorted keys, as the web app hashes it. */
export function canonicalEdition(): string {
  return reply(() => canonicalJson(current()));
}

/** The loaded edition without its id, with sorted keys: its SHA-256 gives the id. */
export function editionBodyCanonical(): string {
  return reply(() => {
    const body: Partial<RuleEdition> = { ...current() };
    delete body.editionId;
    return canonicalJson(body);
  });
}

/** Input { items: BoxItemInput[]; code: string; today: string; live?: DestinationEdition }. Value: BoxResult. */
export function evaluateBoxJson(inputJson: string): string {
  return reply(() => {
    const e = current();
    const input = object(inputJson);
    const items = checkItems(input.items);
    const live = input.live === undefined ? undefined : (plain(input.live, "live") as unknown as DestinationEdition);
    const today = str(input, "today");
    return evaluateBox(items, e, resolveDestination(e, str(input, "code"), live, today), today);
  });
}

/** Input { facts: ItemFacts; answers: ItemAnswers; code: string }. Value: RuleHit[]. */
export function destinationHitsJson(inputJson: string): string {
  return reply(() => {
    const e = current();
    const input = object(inputJson);
    const facts = plain(input.facts, "facts");
    // The destination layer matches tags and reads the category; a string where a list belongs
    // would be matched by substring, so both are checked first.
    if (!Array.isArray(facts.tags) || !facts.tags.every((t) => typeof t === "string")) throw new BadInputError("facts.tags must be a list of strings");
    checkField(FIELDS.get("category")!, facts.category, "facts");
    const answers = plain(input.answers ?? {}, "answers");
    for (const [k, v] of Object.entries(answers)) {
      if (typeof v !== "string") throw new BadInputError(`answers.${k} must be a string`);
    }
    return evaluateDestination(facts as unknown as ItemFacts, answers as ItemAnswers, resolveDestination(e, str(input, "code")));
  });
}

// Label figures as an item carries them: exactly wh and grams, each up to 8 finite numbers above 0.
function checkLabelFigures(v: unknown, path: string): LabelFigures {
  const f = plain(v, path);
  if (Object.keys(f).sort().join(",") !== "grams,wh") throw new BadInputError(`${path} must have exactly wh and grams`);
  for (const k of ["wh", "grams"] as const) {
    const list = f[k];
    if (!Array.isArray(list) || list.length > 8 || !list.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)) {
      throw new BadInputError(`${path}.${k} must be up to 8 numbers above 0`);
    }
  }
  return f as unknown as LabelFigures;
}

/**
 * The Wh and lithium-grams figures an item keeps from its labels, by the engine's own rule (keptLabelFigures), so a
 * native client keeps them without parsing a label itself. Input { texts: string[]; kept?: LabelFigures } (texts:
 * the whole label as read, a second look's whole label, a label the sender typed; kept: the item's figures so far).
 * Value { labelFigures: LabelFigures | null } (null: no figures, leave the field out).
 */
export function labelFiguresJson(inputJson: string): string {
  return reply(() => {
    const input = object(inputJson);
    const texts = input.texts;
    if (!Array.isArray(texts) || !texts.every((t) => typeof t === "string")) throw new BadInputError("texts must be a list of strings");
    const kept = input.kept === undefined ? undefined : checkLabelFigures(input.kept, "kept");
    return { labelFigures: keptLabelFigures(texts as string[], kept) };
  });
}

/** The engine's tags for one label text. */
export function labelTagsJson(labelText: string): string {
  return reply(() => labelTagsOf(labelText, current()));
}

/** A model's reply text checked by the same parser the web app uses (label text clipped). */
export function parseItemReadJson(text: string): string {
  return reply(() => parseItemRead(text));
}

/**
 * A model's reply checked by the same parser, with the engine's tags for its whole label. The read's label text
 * is clipped for showing; the tags come from the label before the cut, so a hazard word past the cap counts and a
 * cut ("FLAMMABLE-FREE" ending at "FLAMMABLE") never makes one. A native client saves these tags as the item's
 * labelTags and never tags the clipped text itself.
 */
export function parseItemReadTaggedJson(text: string): string {
  return reply(() => {
    const { read, fullLabelText } = parseItemReadWithLabel(text);
    return { read, labelTags: labelTagsOf(fullLabelText, current()) };
  });
}

/** True for a read of no item (a camera pointed at a room), which the web app drops instead of adding. */
export function isNoItemJson(readJson: string): string {
  return reply(() => isNoItem(parseItemRead(readJson)));
}

/**
 * Whether an item just added from a read gets a cloud second look, by the web app's own rule
 * (needsSecondLook) on the facts the edition in force derives. Only a read that ran on the device
 * qualifies. Input { item: BoxItemInput; source: string; policy?: SecondLookPolicy } (no policy: every
 * reason on, the web app's default). Value { reason: SecondLookReason | null }.
 */
export function secondLookReasonJson(inputJson: string): string {
  return reply(() => {
    const input = object(inputJson);
    const [item] = checkItems([input.item]);
    const policy = input.policy === undefined ? SECOND_LOOK_DEFAULT : checkPolicy(input.policy);
    return { reason: needsSecondLook(deriveFacts(item!, current()), { source: str(input, "source") }, policy) };
  });
}

/**
 * A cloud second look of the same photo, merged with the on-device read by the web app's rule: the cautious merge
 * (mergeReads), the facts the two reads dispute (readDisputes; label words are compared by the caller, from each
 * read's tags, as the web app's store does), and whether both saw the same kind of item. Input
 * { device: ItemRead; cloud: ItemRead }. Value { merged: ItemRead; disputes: ReadDisputes; sameCategory: boolean }.
 */
export function mergeSecondLookJson(inputJson: string): string {
  return reply(() => {
    const input = object(inputJson);
    const device = checkRead(input.device, "device");
    const cloud = checkRead(input.cloud, "cloud");
    return { merged: mergeReads(device, cloud), disputes: readDisputes(device, cloud), sameCategory: device.category === cloud.category };
  });
}

/** The item-read fields, their JSON schema and the label text cap, for the native read type's tests. */
export function itemReadContract(): string {
  return reply(() => ({ fields: ITEM_READ_FIELDS, schema: itemReadJsonSchema(), labelTextMax: LABEL_TEXT_MAX }));
}
