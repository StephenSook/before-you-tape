// Saves the named sections of an official page as text, so a line quoted from it can be checked word for word
// with no network (src/rules/customsAuthorities.test.ts). It reads only the page's main element, one block a
// line, and writes the source address, the day it was read and the SHA-256 of the whole main text above the
// sections. A page with no main element, or without a named section, is refused rather than saved in part.
//
//   npx tsx scripts/capture-source.ts --url <page> --out <file> --section "<heading>"... --until "<heading>"...
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === "#") return String.fromCodePoint(e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENTITIES[e.toLowerCase()] ?? m;
});
const BLOCK = /<\/?(?:p|div|li|ul|ol|h[1-6]|section|article|header|footer|table|tr|td|th|br|dl|dt|dd|blockquote|figure|figcaption)\b[^>]*>/gi;

export function mainText(html: string): string {
  const m = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html);
  if (!m) throw new Error("the page has no main element");
  const body = m[1]!.replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, "").replace(BLOCK, "\n").replace(/<[^>]+>/g, "");
  return decode(body).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}

// The lines from each named heading up to the next named heading or any heading in `until`.
export function sections(text: string, names: readonly string[], until: readonly string[]): string {
  const lines = text.split("\n");
  const stops = new Set([...names, ...until]);
  return names.map((name) => {
    const at = lines.indexOf(name);
    if (at < 0) throw new Error(`the page has no section headed "${name}"`);
    const end = lines.findIndex((l, i) => i > at && stops.has(l));
    return lines.slice(at, end < 0 ? lines.length : end).join("\n");
  }).join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const all = (flag: string) => args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]!] : []));
  const [url] = all("--url");
  const [out] = all("--out");
  const names = all("--section");
  if (!url || !out || names.length === 0) throw new Error("usage: --url <page> --out <file> --section <heading>... [--until <heading>...]");
  const res = await fetch(url, { headers: { "User-Agent": "before-you-tape-source-check" }, signal: AbortSignal.timeout(20_000) });
  if (res.status !== 200 || !(res.headers.get("content-type") ?? "").includes("text/html")) throw new Error(`${url} answered ${res.status} ${res.headers.get("content-type")}`);
  const text = mainText(await res.text());
  const sha = createHash("sha256").update(text).digest("hex");
  const read = new Date().toISOString().slice(0, 10);
  writeFileSync(out, `Source: ${url}\nRead: ${read}\nMain text SHA-256: ${sha}\n\n${sections(text, names, all("--until"))}\n`);
  console.log(`wrote ${out} (main text ${sha})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
}
