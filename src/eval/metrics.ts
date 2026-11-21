// Pure metrics for the eval (spec 9). Units: agreement and the check rate count rows (item and destination);
// the hazard bound counts items, and an item fails if any destination shows OK where its label does not.
// Latency takes the median of the warm runs per crop, then p50 and p90 across crops, and the paired median
// difference between the two paths with a bootstrap interval resampled by item (fixed seed).
import { hasVerdict, type EvalItem, type EvalRun, type EvalSet, type PathResult, type PublicEvalRun, type PublicPathResult } from "./types";

type AnyPath = PathResult | PublicPathResult;
type AnyRun = EvalRun | PublicEvalRun;

const binomCdf = (k: number, n: number, p: number) => {
  let sum = 0;
  let term = (1 - p) ** n;
  for (let i = 0; i <= k; i++) {
    sum += term;
    term = (term * (n - i) * p) / ((i + 1) * (1 - p));
  }
  return sum;
};

// One-sided upper bound: the p at which seeing k or fewer failures in n has probability alpha.
export function clopperPearsonUpper(k: number, n: number, alpha: number): number {
  if (k >= n) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (binomCdf(k, n, mid) > alpha) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Linear interpolation between ranks.
export function percentile(values: readonly number[], p: number): number {
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const pos = ((s.length - 1) * p) / 100;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}
const median = (v: readonly number[]) => percentile(v, 50);

const exactOf = (item: EvalItem | undefined, path: AnyPath): boolean | null => {
  if ("numbersExact" in path) return path.numbersExact;
  const p = item?.printed;
  if (!p) return null;
  return path.read.volts === p.volts && path.read.milliampHours === p.milliampHours && path.read.wattHours === p.wattHours;
};

// A small fixed-seed generator, so the interval is the same on every machine.
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function computeEvalMetrics(set: EvalSet, run: AnyRun) {
  const items = new Map(set.items.map((i) => [i.itemId, i]));
  const rows = run.rows;
  const truthOf = (itemId: string, d: string) => items.get(itemId)?.truth[d]?.expected;

  // A row with no verdict is never agreement and never a check; it is counted on its own.
  const judged = rows.filter(hasVerdict);
  const agree = judged.filter((r) => truthOf(r.itemId, r.destination) === r.shipped.level).length;
  const checks = judged.filter((r) => r.shipped.level === "check").length;
  const hazards = set.items.filter((i) => i.hazard);
  const failed = hazards.filter((i) => rows.some((r) => r.itemId === i.itemId && r.shipped.level === "ok" && truthOf(i.itemId, r.destination) !== "ok")).length;

  // One read per crop and path: the first row of each item carries them.
  const firstRow = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!firstRow.has(r.itemId)) firstRow.set(r.itemId, r);
  let exactK = 0;
  let exactN = 0;
  let misreads = 0;
  let caught = 0;
  const deviceMs: number[] = [];
  const cloudMs: number[] = [];
  const diffs: number[] = [];
  for (const [itemId, r] of firstRow) {
    const item = items.get(itemId);
    for (const path of [r.device, r.cloud]) {
      if (!path) continue;
      const e = exactOf(item, path);
      if (e === null) continue;
      exactN++;
      if (e) exactK++;
    }
    if (r.device && exactOf(item, r.device) === false) {
      misreads++;
      if (rows.every((x) => x.itemId !== itemId || (hasVerdict(x) && x.shipped.level !== "ok"))) caught++;
    }
    const d = r.device?.msRuns.length ? median(r.device.msRuns) : null;
    const c = r.cloud?.msRuns.length ? median(r.cloud.msRuns) : null;
    if (d !== null) deviceMs.push(d);
    if (c !== null) cloudMs.push(c);
    if (d !== null && c !== null) diffs.push(d - c);
  }

  const rand = seeded(20261122);
  const boots: number[] = [];
  for (let b = 0; b < 2000 && diffs.length > 0; b++) {
    const sample = diffs.map(() => diffs[Math.floor(rand() * diffs.length)]!);
    boots.push(median(sample));
  }

  return {
    truthAgreement: { k: agree, n: rows.length },
    hazardCalledOk: { k: failed, n: hazards.length, upper95: hazards.length ? clopperPearsonUpper(failed, hazards.length, 0.05) : NaN },
    checkRate: { k: checks, n: rows.length },
    noVerdict: { k: rows.length - judged.length, n: rows.length },
    numbersExact: { k: exactK, n: exactN },
    misreadsCaught: { k: caught, n: misreads },
    latency: {
      device: { p50: percentile(deviceMs, 50), p90: percentile(deviceMs, 90), n: deviceMs.length },
      cloud: { p50: percentile(cloudMs, 50), p90: percentile(cloudMs, 90), n: cloudMs.length },
      pairedMedianDiffMs: diffs.length ? median(diffs) : NaN,
      diffCi95: (boots.length ? [percentile(boots, 2.5), percentile(boots, 97.5)] : [NaN, NaN]) as [number, number],
    },
  };
}

// The public copy: each read becomes only whether its numbers matched the printed ones.
export function redactRun(run: EvalRun, set: EvalSet): PublicEvalRun {
  const items = new Map(set.items.map((i) => [i.itemId, i]));
  const pub = (itemId: string, p: PathResult | null): PublicPathResult | null =>
    p ? { numbersExact: exactOf(items.get(itemId), p), msRuns: [...p.msRuns], level: p.level } : null;
  return { ...run, rows: run.rows.map((r) => ({ ...r, device: pub(r.itemId, r.device), cloud: pub(r.itemId, r.cloud) })) };
}
