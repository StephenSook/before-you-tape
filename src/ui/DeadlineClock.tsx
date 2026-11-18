export type HolidayDate = {
  service: "priority_mail_international";
  region: string;
  dateIso: string;
  sourceUrl: string;
  checkedOn: string;
};

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const deadlineFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function utcCalendarDate(year: number, month: number, day: number): number {
  // Date.UTC treats years 0 through 99 as 1900 through 1999.
  if (year >= 0 && year < 100) {
    return new Date(Date.UTC(year + 400, month, day)).setUTCFullYear(year);
  }
  return Date.UTC(year, month, day);
}

/** Whole calendar days from the local date of `now` to `dateIso`; NaN when `dateIso` is not a real YYYY-MM-DD date. */
export function daysLeft(dateIso: string, now: Date): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return Number.NaN;
  const year = Number(dateIso.slice(0, 4));
  const month = Number(dateIso.slice(5, 7)) - 1;
  const day = Number(dateIso.slice(8, 10));
  const deadline = utcCalendarDate(year, month, day);
  const check = new Date(deadline);
  if (check.getUTCMonth() !== month || check.getUTCDate() !== day) return Number.NaN;
  const today = utcCalendarDate(now.getFullYear(), now.getMonth(), now.getDate());
  return (deadline - today) / MILLISECONDS_PER_DAY;
}

export function DeadlineClock({ dates, now, region }: {
  dates: HolidayDate[];
  now: Date;
  region?: string;
}) {
  const entry = region === undefined
    ? dates.reduce<HolidayDate | undefined>(
      (earliest, date) => !earliest || date.dateIso < earliest.dateIso ? date : earliest,
      undefined,
    )
    : dates.find((date) => date.region === region);
  if (!entry) return null;

  const days = daysLeft(entry.dateIso, now);
  if (!Number.isFinite(days) || days < 0) return null;

  const text = days === 0
    ? "Today is the recommended last day for Priority Mail International"
    : `${days === 1 ? "day" : "days"} left to the recommended Priority Mail International date`;

  return (
    <div className="deadline-clock">
      <p>
        {days > 0 && <><strong className="deadline-clock__days" style={{ fontSize: "2rem" }}>{days}</strong>{" "}</>}
        <span className="deadline-clock__text">{text}</span>
      </p>
      <p>
        <time dateTime={entry.dateIso}>{deadlineFormatter.format(new Date(entry.dateIso))}</time>{" "}
        <a className="deadline-clock__source" href={entry.sourceUrl} target="_blank" rel="noopener noreferrer">
          USPS holiday dates
        </a>
      </p>
    </div>
  );
}
