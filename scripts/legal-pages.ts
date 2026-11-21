// Builds the static legal pages (/privacy/, /support/) from their sources in legal/*.md, so the page a visitor
// reads signed out is exactly the text that was approved. A test holds each served page to its source.
//   npm run legal
// The Markdown is a small subset: "# " and "## " headings, paragraphs, "- " and "1. " lists (a continued line
// is indented), **bold** and [links](/path or https://...). Everything else is escaped.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot } from "./lib/files";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(text: string): string {
  let out = "";
  let rest = text;
  const link = /\[([^\]]+)\]\(([^)\s]+)\)/;
  for (let m = link.exec(rest); m; m = link.exec(rest)) {
    const href = m[2]!;
    if (!/^(\/|https:\/\/)/.test(href)) throw new Error(`refusing link ${href}: only this site's paths and https links`);
    out += bold(escape(rest.slice(0, m.index))) + `<a href="${escape(href)}">${bold(escape(m[1]!))}</a>`;
    rest = rest.slice(m.index + m[0].length);
  }
  return out + bold(escape(rest));
}
const bold = (escaped: string) => escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

function body(md: string): { title: string; html: string } {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let title = "";
  let para: string[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;
  const flushPara = () => { if (para.length) blocks.push(`<p>${inline(para.join(" "))}</p>`); para = []; };
  const flushList = () => {
    if (list) blocks.push(`<${list.kind}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.kind}>`);
    list = null;
  };
  for (const line of lines) {
    const bullet = /^- (.*)$/.exec(line);
    const numbered = /^\d+\. (.*)$/.exec(line);
    if (line.trim() === "") { flushPara(); flushList(); continue; }
    if (line.startsWith("# ")) { flushPara(); flushList(); title = line.slice(2).trim(); blocks.push(`<h1>${inline(title)}</h1>`); continue; }
    if (line.startsWith("## ")) { flushPara(); flushList(); blocks.push(`<h2>${inline(line.slice(3).trim())}</h2>`); continue; }
    if (bullet || numbered) {
      flushPara();
      const kind = bullet ? "ul" : "ol";
      if (list && list.kind !== kind) flushList();
      list ??= { kind, items: [] };
      list.items.push((bullet ?? numbered)![1]!.trim());
      continue;
    }
    if (list && /^\s+\S/.test(line)) { list.items[list.items.length - 1] += ` ${line.trim()}`; continue; }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return { title, html: blocks.join("\n") };
}

export function renderLegal(md: string, name: string): string {
  const { title, html } = body(md);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="canonical" href="https://before-you-tape-2026.web.app/${name}/">
  <title>${escape(title || name)} | Before You Tape</title>
  <style>
    :root { --paper: #fff3e6; --ink: #1d1712; }
    body { margin: 0; background: var(--paper); color: var(--ink); font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.5; }
    header, main { max-width: 42rem; margin: 0 auto; padding: 16px; }
    a { color: var(--ink); }
    h1 { font-size: 2rem; margin: 8px 0 16px; }
    h2 { font-size: 1.25rem; margin: 28px 0 8px; }
    li { margin: 0 0 8px; }
  </style>
</head>
<body>
  <header><a href="/">Before You Tape</a></header>
  <main>
${html}
  </main>
</body>
</html>
`;
}

function main(): void {
  const root = repoRoot();
  for (const file of readdirSync(join(root, "legal")).filter((f) => f.endsWith(".md"))) {
    const name = file.replace(/\.md$/, "");
    mkdirSync(join(root, "public", name), { recursive: true });
    writeFileSync(join(root, "public", name, "index.html"), renderLegal(readFileSync(join(root, "legal", file), "utf8"), name));
    console.log(`legal: public/${name}/index.html`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
