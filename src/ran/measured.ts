// The /ran page shows measured totals only from a file it can read in full and that is recent: a file of any other
// shape, or one that holds a count under 5 not written as "fewer than 5", is unreadable, and one measured more than
// STALE_DAYS days before this device's date is stale. Either way the page says so and shows no number.
import type { Count, Measured, Timed } from "./summarize";

// 31 days: the totals measured on 2026-11-21 stay shown through 2026-12-22, after judging (December 10 to 16) and the
// winners' announcement (December 21), by any viewer's own date. A test checks the shipped file against that date.
export const STALE_DAYS = 31;
export type MeasuredRead = { ok: true; data: Measured } | { ok: false; reason: "unreadable" | "stale" };

type Obj = Record<string, unknown>;
const obj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const exactly = (v: Obj, keys: string[]) => Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
const day = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const big = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 5;
const ms = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const few = (v: Obj) => exactly(v, ["fewerThan"]) && v.fewerThan === 5;

const isCount = (v: unknown): v is Count => obj(v) && (few(v) || (exactly(v, ["n"]) && big(v.n)));
const isTimed = (v: unknown): v is Timed => obj(v) && (few(v)
  || (exactly(v, ["n", "p50Ms", "p90Ms"]) && big(v.n) && ms(v.p50Ms) && ms(v.p90Ms) && v.p90Ms >= v.p50Ms));

function isMeasured(v: unknown): v is Measured {
  if (!obj(v) || !exactly(v, ["measuredAt", "source", "window", "boxes", "items", "typedByHand", "reads", "secondLooks", "fallbacks"])) return false;
  if (typeof v.measuredAt !== "string" || Number.isNaN(Date.parse(v.measuredAt))) return false;
  if (typeof v.source !== "string" || v.source.trim() === "") return false;
  if (v.window !== null && !(obj(v.window) && exactly(v.window, ["from", "to"]) && day(v.window.from) && day(v.window.to) && v.window.from <= v.window.to)) return false;
  if (!obj(v.reads) || !exactly(v.reads, ["onDevice", "inCloud"]) || !isTimed(v.reads.onDevice) || !isTimed(v.reads.inCloud)) return false;
  return isCount(v.boxes) && isCount(v.items) && isCount(v.typedByHand) && isTimed(v.secondLooks) && isCount(v.fallbacks);
}

// today: this device's calendar date, as the rule layers count it.
export function readMeasured(file: unknown, today: string): MeasuredRead {
  if (!isMeasured(file)) return { ok: false, reason: "unreadable" };
  const measured = file.measuredAt.slice(0, 10);
  if (!day(measured) || measured > today) return { ok: false, reason: "unreadable" };
  const age = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${measured}T00:00:00Z`)) / 86_400_000);
  return age > STALE_DAYS ? { ok: false, reason: "stale" } : { ok: true, data: file };
}
