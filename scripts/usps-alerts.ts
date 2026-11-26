// Reads a saved copy of the USPS international service alerts page (rules/suspensions.json's url) the way the rules
// need it read: only the rows of its "Suspension Due to ..." tables list a suspended destination. HTML comments and
// any element whose class says it is inactive (the page's hidden message bar, an old banner with no year) are dropped
// first, and a guarantee table (Global Express Guaranteed, Priority Mail Express International Guarantee) suspends a
// guarantee, not the mail. Any other visible line that mentions a suspension is listed as a notice for a person to
// check, never applied. It reads a file and fetches nothing:
//   npx tsx scripts/usps-alerts.ts <saved page.html>
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface ServiceAlerts {
  /** The page's own "Updated:" date, as printed, or null. */
  updated: string | null;
  /** Destination names in the page's suspension tables, in page order. */
  suspended: string[];
  /** Other visible text that mentions a suspension, for a person to check. */
  notices: string[];
}

const decode = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&(trade|reg|copy);/g, "").replace(/&[lr]dquo;/g, '"').replace(/&mdash;/g, "-")
    .replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const text = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** The page with comments, scripts, styles and inactive elements taken out. */
export function visibleHtml(html: string): string {
  let out = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, "");
  // An element whose class list holds "inactive" is not shown. Drop it with its contents, innermost first, so a
  // nested element of the same tag cannot end it early.
  const inactive = /<(section|div|aside|p|span|ul|li)\b[^>]*\bclass\s*=\s*["'][^"']*\binactive\b[^"']*["'][^>]*>((?:(?!<\1\b)[\s\S])*?)<\/\1>/i;
  for (let m = inactive.exec(out); m; m = inactive.exec(out)) out = out.slice(0, m.index) + out.slice(m.index + m[0].length);
  return out;
}

export function readServiceAlerts(html: string): ServiceAlerts {
  const page = visibleHtml(html);
  const updated = /Updated:\s*([A-Z][a-z]{2,8}\.? \d{1,2}, \d{4})/.exec(text(page))?.[1] ?? null;
  const suspended: string[] = [];
  const tables = [...page.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((m) => m[0]);
  for (const table of tables) {
    const rows = [...table.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((m) => m[0]);
    const head = rows[0] ? text(rows[0]) : "";
    if (!/^Suspension Due to /i.test(head)) continue;
    for (const row of rows.slice(1)) {
      for (const cell of row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
        // A cell can hold several names, one per link or line.
        const parts = cell[1]!.split(/<br\s*\/?>|<\/a>|<\/p>|<\/li>/i).map(text).filter(Boolean);
        suspended.push(...parts);
      }
    }
  }
  // Each block of text outside the tables (a paragraph, a list item, a link) is one candidate notice.
  const outside = tables.reduce((p, t) => p.replace(t, " "), page);
  const blocks = outside.replace(/<\/?(?:p|div|li|h[1-6]|section|header|footer|nav|main|br|ul|ol|a)\b[^>]*>/gi, "\n").split("\n").map(text);
  const notices = [...new Set(blocks.filter((s) => s.length <= 400 && /\bsuspen(d|sion)/i.test(s)))];
  return { updated, suspended, notices };
}

function main(): void {
  const file = process.argv[2];
  if (!file) throw new Error("usage: npx tsx scripts/usps-alerts.ts <saved page.html>");
  const r = readServiceAlerts(readFileSync(file, "utf8"));
  console.log(`updated: ${r.updated ?? "not found"}`);
  console.log(`suspended (${r.suspended.length}): ${r.suspended.join(", ")}`);
  for (const n of r.notices) console.log(`notice to check by hand: ${n}`);
  if (r.suspended.length === 0) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1); }
}
