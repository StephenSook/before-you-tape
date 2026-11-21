// Days left to mail a box for the holiday, by the USPS holiday mailing dates (holiday_dates_json), with a link to
// the USPS page they were read from. Nothing shows with no date, once a date has passed, or when mail to the country
// is suspended or stops on or before that date: then the suspension is the date that counts, and the destination
// note says so.
import type { HolidayDate } from "../config/holidayDates";
import { localDay } from "../shared/localDay";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthDay = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
const utc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

// Whole days from this device's calendar date to dateIso: 0 on the day, negative once it has passed.
export function daysLeft(dateIso: string, now: Date): number {
  return Math.round((utc(dateIso) - utc(localDay(now))) / 86_400_000);
}

export interface ClockDestination { name: string; suspended: boolean; suspendsFrom: string | null }

export function DeadlineClock({ dates, now, destination }: { dates: readonly HolidayDate[]; now: Date; destination: ClockDestination }) {
  if (destination.suspended) return null;
  const next = [...dates].filter((d) => daysLeft(d.sendBy, now) >= 0).sort((a, b) => a.sendBy.localeCompare(b.sendBy))[0];
  if (!next || (destination.suspendsFrom !== null && destination.suspendsFrom <= next.sendBy)) return null;
  const left = daysLeft(next.sendBy, now);
  const by = left === 0 ? `by today, ${monthDay(next.sendBy)},` : `by ${monthDay(next.sendBy)}`;
  const tail = left === 0 ? "." : `: ${left} ${left === 1 ? "day" : "days"} left.`;
  return (
    <p className="deadline-clock" data-testid="deadline-clock">
      USPS suggests mailing {by} for {monthDay(next.deliverBy)} ({next.service}){tail}{" "}
      <a href={next.sourceUrl} target="_blank" rel="noreferrer">USPS holiday dates</a>
    </p>
  );
}
