// What a destination's own customs authority says about duty and tax on mailed items, quoted word for word from its
// own page (rules/customs-authorities.json; each quote is checked against the page's saved text by a test). Shown
// on the Rules page only while fresh, by the same customs limit as the rule edition's customs layer. No values, no
// totals, no conversion: only the authority's words, its page and the day they were read.
export interface CustomsLine { label: string; quote: string }
export interface CustomsAuthority { code: string; authority: string; url: string; checkedOn: string; source: string; lines: CustomsLine[] }

type Obj = Record<string, unknown>;
const obj = (v: unknown, where: string): Obj => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error(`${where} is not an object`);
  return v as Obj;
};
const exactly = (o: Obj, keys: string[], where: string) => {
  if (Object.keys(o).length !== keys.length || !keys.every((k) => Object.hasOwn(o, k))) throw new Error(`${where} must have exactly ${keys.join(", ")}`);
};
const text = (v: unknown, where: string): string => {
  if (typeof v !== "string" || v.trim() === "") throw new Error(`${where} is not text`);
  return v;
};
const day = (v: unknown, where: string): string => {
  const s = text(v, where);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) !== s) throw new Error(`${where} is not a date`);
  return s;
};

export function readCustomsAuthorities(raw: unknown): CustomsAuthority[] {
  if (!Array.isArray(raw)) throw new Error("customs authorities must be a list");
  return raw.map((v, i) => {
    const where = `customs authorities[${i}]`;
    const o = obj(v, where);
    exactly(o, ["code", "authority", "url", "checkedOn", "source", "lines"], where);
    const code = text(o.code, `${where}.code`);
    if (!/^[A-Z]{2}$/.test(code)) throw new Error(`${where}.code is not a two-letter code`);
    const url = text(o.url, `${where}.url`);
    if (!url.startsWith("https://")) throw new Error(`${where}.url is not https`);
    const source = text(o.source, `${where}.source`);
    if (!/^rules\/sources-text\/[a-z0-9-]+\.txt$/.test(source)) throw new Error(`${where}.source is not a saved page in rules/sources-text`);
    if (!Array.isArray(o.lines) || o.lines.length === 0) throw new Error(`${where}.lines is empty`);
    const lines = o.lines.map((l, j) => {
      const lo = obj(l, `${where}.lines[${j}]`);
      exactly(lo, ["label", "quote"], `${where}.lines[${j}]`);
      return { label: text(lo.label, `${where}.lines[${j}].label`), quote: text(lo.quote, `${where}.lines[${j}].quote`) };
    });
    return { code, authority: text(o.authority, `${where}.authority`), url, checkedOn: day(o.checkedOn, `${where}.checkedOn`), source, lines };
  });
}

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// The country's lines while they are fresh: read no more than staleDays before today.
export function customsLinesFor(entries: readonly CustomsAuthority[], code: string, today: string, staleDays: number): CustomsAuthority | null {
  const e = entries.find((x) => x.code === code);
  return e && today <= addDays(e.checkedOn, staleDays) ? e : null;
}
