// The device's own calendar date as YYYY-MM-DD, built from its local date parts. Locale formatting
// ("en-CA") gives this shape in today's browsers, but no standard promises it.
export function localDay(d: Date = new Date()): string {
  const pad = (n: number, w: number) => String(n).padStart(w, "0");
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}
