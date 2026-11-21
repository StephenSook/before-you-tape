// The holiday mailing dates (holiday_dates_json): each a USPS service, the date to mail by and the date it is meant
// to arrive by, with the USPS page it was read from and the day it was read. Read only from that page; a list that
// is not exactly this shape keeps the in-app default, and an empty list turns the dates off.
export interface HolidayDate {
  service: string;
  sendBy: string;
  deliverBy: string;
  sourceUrl: string;
  checkedOn: string;
}

const KEYS = ["service", "sendBy", "deliverBy", "sourceUrl", "checkedOn"];
const MAX = 10;

const day = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

function isHolidayDate(v: unknown): v is HolidayDate {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  if (Object.keys(o).length !== KEYS.length || !KEYS.every((k) => Object.hasOwn(o, k))) return false;
  if (typeof o.service !== "string" || o.service.trim() === "" || o.service.length > 80) return false;
  if (!day(o.sendBy) || !day(o.deliverBy) || !day(o.checkedOn) || o.sendBy > o.deliverBy) return false;
  if (typeof o.sourceUrl !== "string") return false;
  try {
    const u = new URL(o.sourceUrl);
    return u.protocol === "https:" && u.hostname === "www.usps.com";
  } catch {
    return false;
  }
}

export function holidayDates(raw: string, fallback: readonly HolidayDate[]): HolidayDate[] {
  if (raw.trim() === "") return [...fallback];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) && v.length <= MAX && v.every(isHolidayDate) ? v.map((d) => ({ ...d })) : [...fallback];
  } catch {
    return [...fallback];
  }
}
