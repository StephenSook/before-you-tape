// What /ran says about our own test: the shipped route of the newest public model run in eval/runs (where each
// check was read, how many items got a cloud second look, hazards called OK, agreement with our draft labels, and
// time to a verdict). scripts/ran-eval.ts writes it to src/ran/eval.json, and a test fails if that file and the
// run disagree, so no number on the page is typed by hand.

export interface KOfN { k: number; n: number }

export interface EvalSummary {
  runId: string;
  date: string;
  machine: string;
  chrome: string;
  models: string;
  editionId: string;
  source: string;
  items: number;
  destinations: number;
  // One check is one item for one destination.
  checks: number;
  // Checks the shipped route read on the device.
  readOnDevice: number;
  // Items that got a cloud second look for at least one destination.
  secondLookItems: number;
  // Agreement with our draft labels, which no second person has checked: not accuracy.
  agreement: KOfN;
  hazardsCalledOk: KOfN;
  checkThis: KOfN;
  p50Ms: number;
  p90Ms: number;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown, what: string): Obj => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error(`the run's ${what} is not an object`);
  return v as Obj;
};
const str = (v: unknown, what: string): string => {
  if (typeof v !== "string" || v.trim() === "") throw new Error(`the run's ${what} is not a string`);
  return v;
};
const count = (v: unknown, what: string): number => {
  if (!Number.isInteger(v) || (v as number) < 0) throw new Error(`the run's ${what} is not a count`);
  return v as number;
};
const kOfN = (v: unknown, what: string): KOfN => {
  const o = obj(v, what);
  const k = count(o.k, `${what}.k`);
  const n = count(o.n, `${what}.n`);
  if (k > n) throw new Error(`the run's ${what} has k over n`);
  return { k, n };
};
const ms = (v: unknown, what: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new Error(`the run's ${what} is not a time`);
  return Math.round(v);
};

export function summarizeEval(file: unknown, source: string): EvalSummary {
  const run = obj(file, "file");
  if (!Array.isArray(run.rows) || run.rows.length === 0) throw new Error("the run has no rows");
  const rows = run.rows.map((r, i) => {
    const row = obj(r, `row ${i}`);
    const shipped = obj(row.shipped, `row ${i} shipped`);
    return { itemId: str(row.itemId, `row ${i} itemId`), destination: str(row.destination, `row ${i} destination`), source: str(shipped.source, `row ${i} source`), secondLook: shipped.secondLook === true };
  });
  const all = obj(obj(run.metrics, "metrics").allItems, "metrics.allItems");
  const shippedTime = obj(obj(all.latency, "latency").shipped, "latency.shipped");
  return {
    runId: str(run.runId, "runId"),
    date: str(run.date, "date"),
    machine: str(run.machine, "machine"),
    chrome: str(run.chromeVersion, "chromeVersion"),
    models: str(run.modelShown, "modelShown"),
    editionId: str(run.editionId, "editionId"),
    source,
    items: count(all.items, "items"),
    destinations: new Set(rows.map((r) => r.destination)).size,
    checks: rows.length,
    readOnDevice: rows.filter((r) => r.source === "on_device").length,
    secondLookItems: new Set(rows.filter((r) => r.secondLook).map((r) => r.itemId)).size,
    agreement: kOfN(all.truthAgreement, "truthAgreement"),
    hazardsCalledOk: kOfN(all.hazardCalledOk, "hazardCalledOk"),
    checkThis: kOfN(all.checkRate, "checkRate"),
    p50Ms: ms(shippedTime.p50, "shipped p50"),
    p90Ms: ms(shippedTime.p90, "shipped p90"),
  };
}

// The /ran page's guard on src/ran/eval.json: a file of exactly this shape, with counts that add up, or none.
const KEYS = ["runId", "date", "machine", "chrome", "models", "editionId", "source", "items", "destinations", "checks",
  "readOnDevice", "secondLookItems", "agreement", "hazardsCalledOk", "checkThis", "p50Ms", "p90Ms"];
const exactly = (v: Obj, keys: string[]) => Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isText = (v: unknown) => typeof v === "string" && v.trim() !== "";
const isKOfN = (v: unknown) => isObj(v) && exactly(v, ["k", "n"]) && isCount(v.k) && isCount(v.n) && v.k <= v.n;

export function readEval(file: unknown): { ok: true; data: EvalSummary } | { ok: false } {
  if (!isObj(file) || !exactly(file, KEYS)) return { ok: false };
  const f = file;
  const fine = ["runId", "machine", "chrome", "models", "editionId", "source"].every((k) => isText(f[k]))
    && typeof f.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f.date)
    && ["items", "destinations", "checks", "readOnDevice", "secondLookItems", "p50Ms", "p90Ms"].every((k) => isCount(f[k]))
    && (f.readOnDevice as number) <= (f.checks as number) && (f.secondLookItems as number) <= (f.items as number)
    && (f.p90Ms as number) >= (f.p50Ms as number)
    && isKOfN(f.agreement) && isKOfN(f.hazardsCalledOk) && isKOfN(f.checkThis);
  return fine ? { ok: true, data: f as unknown as EvalSummary } : { ok: false };
}
