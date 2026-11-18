import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { lineAndColumn, readFiles, type TextFile } from "./lib/files";

// Long dashes and curly quotes, listed by code point so this file never contains them.
const BANNED: ReadonlyMap<number, string> = new Map([
  [0x2014, "em dash"],
  [0x2013, "en dash"],
  [0x201c, "left double quote"],
  [0x201d, "right double quote"],
  [0x2018, "left single quote"],
  [0x2019, "right single quote"],
]);

export const TONE_PATHSPECS = [
  "README.md",
  "CHANGELOG.md",
  "index.html",
  "public/extension-privacy.html",
  ":(glob)extension/**",
  ":(exclude)extension/dist/**",
  ":(exclude)extension/out/**",
  ":(glob)src/**/*.ts",
  ":(glob)src/**/*.tsx",
  ":(glob)rules/**",
  ":(glob)content/**",
];

// Measured on 2026-11-17 at bootstrap: 7 files. A walk below this means the pathspecs broke.
export const TONE_MIN_FILES = 5;

export function findToneHits(text: string): Array<{ index: number; char: string }> {
  const hits: Array<{ index: number; char: string }> = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (BANNED.has(code)) hits.push({ index: i, char: text[i] as string });
  }
  return hits;
}

export function checkFiles(files: TextFile[], minFiles: number): { ok: boolean; messages: string[] } {
  const messages: string[] = [];
  for (const file of files) {
    for (const hit of findToneHits(file.text)) {
      const { line, column } = lineAndColumn(file.text, hit.index);
      messages.push(`${file.path}:${line}:${column} ${BANNED.get(hit.char.charCodeAt(0))}`);
    }
  }
  if (files.length < minFiles) messages.push(`tone check walked ${files.length} files, expected at least ${minFiles}`);
  return { ok: messages.length === 0, messages };
}

function main(): void {
  const files = readFiles(TONE_PATHSPECS);
  const result = checkFiles(files, TONE_MIN_FILES);
  for (const m of result.messages) console.error(m);
  console.log(`tone check: ${files.length} files, ${result.ok ? "clean" : "FAILED"}`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
