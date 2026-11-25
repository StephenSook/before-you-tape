// Who checked each destination's rule lines (rules/reviews.json), kept outside the rule edition so a review
// changes no verdict and no app build. Each record names the lines it covers by their SHA-256 (the canonical JSON
// of the edition's lines for that country): a test and the release gate refuse a record whose lines have changed
// since. This is an approval as a whole; a person's line-by-line check is the edition's personReviewedOn.
export interface Approval {
  linesSha256: string;
  aiCheckedOn: string;
  aiCheck: string;
  personApprovedOn: string;
  personApprovedBy: string;
  personApproval: string;
  restatedOn: string;
}
export interface Reviews { listings: Readonly<Record<string, Approval>> }

type Obj = Record<string, unknown>;
const KEYS = ["linesSha256", "aiCheckedOn", "aiCheck", "personApprovedOn", "personApprovedBy", "personApproval", "restatedOn"];
const obj = (v: unknown, where: string): Obj => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error(`${where} is not an object`);
  return v as Obj;
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

export function readReviews(raw: unknown): Reviews {
  const top = obj(raw, "reviews");
  const listings = obj(top.listings, "reviews.listings");
  const out: Record<string, Approval> = {};
  for (const [code, v] of Object.entries(listings)) {
    const where = `reviews.listings.${code}`;
    const o = obj(v, where);
    if (Object.keys(o).length !== KEYS.length || !KEYS.every((k) => Object.hasOwn(o, k))) throw new Error(`${where} must have exactly ${KEYS.join(", ")}`);
    const linesSha256 = text(o.linesSha256, `${where}.linesSha256`);
    if (!/^[0-9a-f]{64}$/.test(linesSha256)) throw new Error(`${where}.linesSha256 is not a SHA-256`);
    const a: Approval = {
      linesSha256, aiCheckedOn: day(o.aiCheckedOn, `${where}.aiCheckedOn`), aiCheck: text(o.aiCheck, `${where}.aiCheck`),
      personApprovedOn: day(o.personApprovedOn, `${where}.personApprovedOn`), personApprovedBy: text(o.personApprovedBy, `${where}.personApprovedBy`),
      personApproval: text(o.personApproval, `${where}.personApproval`), restatedOn: day(o.restatedOn, `${where}.restatedOn`),
    };
    if (a.restatedOn < a.personApprovedOn) throw new Error(`${where}.restatedOn is before the approval it restates`);
    out[code] = a;
  }
  return { listings: out };
}

export const approvalOf = (reviews: Reviews, code: string): Approval | null => reviews.listings[code] ?? null;
