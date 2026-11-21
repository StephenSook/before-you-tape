// Totals for /ran from the route records saved boxes already hold: each item's read source, read time, second look
// and fallback. Only counts and times come out, never an id, a category or a name, and any total under 5 comes out
// as "fewer than 5", with no time, so no number can point at one visitor.

// One saved item's route record, as read from Firestore.
export interface RouteRow {
  readSource: string;
  readMs: number;
  secondLookMs?: number | null;
  fallback?: { after: string; route: string } | null;
  createTime: string;
}

export type Count = { n: number } | { fewerThan: 5 };
export type Timed = { n: number; p50Ms: number; p90Ms: number } | { fewerThan: 5 };

export interface Measured {
  measuredAt: string;
  source: string;
  // The first and last day an item in these totals was saved.
  window: { from: string; to: string } | null;
  boxes: Count;
  items: Count;
  // Typed by hand: no model read. Our own deploy checks type an item, so they count here and never in reads.
  typedByHand: Count;
  reads: { onDevice: Timed; inCloud: Timed };
  secondLooks: Timed;
  fallbacks: Count;
}

const SMALL = 5;
const count = (n: number): Count => (n < SMALL ? { fewerThan: SMALL } : { n });

// The nearest-rank percentile of times already sorted.
const rank = (sorted: number[], p: number) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]!;

function timed(ms: number[]): Timed {
  if (ms.length < SMALL) return { fewerThan: SMALL };
  const sorted = [...ms].sort((a, b) => a - b);
  return { n: ms.length, p50Ms: rank(sorted, 0.5), p90Ms: rank(sorted, 0.9) };
}

const ON_DEVICE = new Set(["on_device", "phone_on_device"]);
const IN_CLOUD = new Set(["in_cloud", "cloud_unreported", "phone_cloud"]);

export function summarizeRoutes(rows: readonly RouteRow[], boxes: number, measuredAt: string, source: string): Measured {
  const days = rows.map((r) => r.createTime.slice(0, 10)).sort();
  return {
    measuredAt,
    source,
    window: days.length ? { from: days[0]!, to: days.at(-1)! } : null,
    boxes: count(boxes),
    items: count(rows.length),
    typedByHand: count(rows.filter((r) => r.readSource === "manual").length),
    reads: {
      onDevice: timed(rows.filter((r) => ON_DEVICE.has(r.readSource)).map((r) => r.readMs)),
      inCloud: timed(rows.filter((r) => IN_CLOUD.has(r.readSource)).map((r) => r.readMs)),
    },
    secondLooks: timed(rows.flatMap((r) => (typeof r.secondLookMs === "number" ? [r.secondLookMs] : []))),
    fallbacks: count(rows.filter((r) => r.fallback).length),
  };
}
