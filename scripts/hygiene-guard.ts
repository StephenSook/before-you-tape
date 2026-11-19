// Public hygiene: repository text must not name private planning tools, notes, review rule ids or
// private paths. While the repository is private this only reports; once GitHub says it is public,
// any hit fails CI. Words are matched by SHA-256 of each lowercased word, so this file names none.
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { lineAndColumn, readFiles, type TextFile } from "./lib/files";

const PRIVATE_WORDS = new Set([
  "11376b7e2acf0c93001f16d10c7ef82ecc88f2292851ba9a5fb14767c7d027ec",
  "bf24385098410391a81d92b2de72d3a2946d24f42ee387e51004a868281a2408",
  "eba4ae33f54ae0f96bed25bfc13abd887ae157380330cd3fd3f0a4d054ce3a3f",
  "45094d013c01182ea62b68590335599f0d663e554122b0c2f5acee49b69cc083",
  "e6f0a1fbb43c89196dcfcbef85908f19ab4c5f7cc4f4c452284697757683d7ef",
  "4e2295dd929e424aa1afde7049924cb231f451c9884d7915ae33690b73b227ec",
  "2c418fc8d1f44da53b8617acd76ae9b81ff81c236e4d4706d20725175e735970",
  "8d5c1c1d3890d7e74e4529250848bd6836eea6ee96bb592ac8cf9ad67ec95174",
  // Build-process words and phrases (a phrase is two words joined by "-", a space or "/").
  "1db147fa22abae8a70c94152c9ec8cb82bdd0cc8135730a11879ae9dd7ad0375",
  "d351547e00f627cb719cd2c26ae78b092f7af87fbb2fbf7b42ff483c29eeb984",
  "93959d627f900c159eb24d1621ea5a7f540b55b8088de32a3034cebb0c6b7dcc",
  "dbbf1f13afc72262623e57579bc404f54e2e4a7f3bfd199e9ca321ced7f1ba8f",
  "4e0ef0580c2537a64530885d1c3910406bec9e383d5e13af1c5ca96913f39b6b",
  "d148ce894d5bd13ffc6bd2c4b7731613a3f8f6b84fc63f8a6e5718c97f1c3cb8",
  "e58c6fe1372f09e2f9fd4c8617425e829a6b26e1e7a63fe43a0fd0070c52dd25",
]);

// Shapes that are private by form, not by word.
const PRIVATE_SHAPES: ReadonlyArray<{ kind: string; re: RegExp }> = [
  { kind: "a review rule id", re: /\bHR ?\d{1,3}\b/g },
  { kind: "a private home path", re: /~\/\.claude\b/g },
  { kind: "a private home path", re: /\/Users\/[A-Za-z0-9._-]+\//g },
  // A build work stream named as a role ("lane A", "lane C's", "lane-b"); branch names such as lane-web do not match.
  { kind: "a build work stream", re: /\blane[ -][a-d]\b/gi },
];

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const isPrivate = (w: string) => PRIVATE_WORDS.has(sha(w)) || (w.length > 3 && w.endsWith("s") && PRIVATE_WORDS.has(sha(w.slice(0, -1))));
// The author's own surname is fine after the given name, as in the copyright line.
const AUTHOR_GIVEN = "stephen";

export function findPrivateTerms(files: TextFile[]): string[] {
  const out: string[] = [];
  for (const f of files) {
    const at = (i: number, kind: string) => {
      const { line, column } = lineAndColumn(f.text, i);
      out.push(`${f.path}:${line}:${column} ${kind}`);
    };
    let prev: { word: string; end: number } | null = null;
    for (const m of f.text.matchAll(/[A-Za-z0-9]+/g)) {
      const word = m[0].toLowerCase();
      const between = prev ? f.text.slice(prev.end, m.index) : "";
      const afterAuthor = prev?.word === AUTHOR_GIVEN && /^[ \t]+$/.test(between);
      if (isPrivate(word) && !afterAuthor) at(m.index, "a private word");
      else if (prev && ["/", "-", " "].includes(between) && isPrivate(`${prev.word}${between}${word}`)) {
        at(m.index, between === "/" ? "a private path" : "a private phrase");
      }
      prev = { word, end: m.index + m[0].length };
    }
    for (const s of PRIVATE_SHAPES) for (const m of f.text.matchAll(s.re)) at(m.index, s.kind);
  }
  return out;
}

export interface HygieneMode { repoPrivate: string | undefined; ci: boolean }

export function hygieneVerdict(files: TextFile[], minFiles: number, mode: HygieneMode): { exitCode: 0 | 1; messages: string[] } {
  const hits = findPrivateTerms(files);
  const floor = files.length < minFiles ? [`hygiene guard walked ${files.length} files, expected at least ${minFiles}`] : [];
  // In CI a missing flag fails closed; only a repository GitHub calls private gets report-only.
  const reportOnly = mode.repoPrivate === "true" || (!mode.ci && mode.repoPrivate === undefined);
  if (reportOnly) {
    return { exitCode: floor.length ? 1 : 0, messages: [...floor, ...hits.map((h) => `${h} (would fail once the repository is public)`)] };
  }
  return { exitCode: floor.length || hits.length ? 1 : 0, messages: [...floor, ...hits] };
}

export const HYGIENE_PATHSPECS = [
  ".",
  ":(exclude)scripts/hygiene-guard.ts",
  ":(exclude)scripts/hygiene-guard.test.ts",
  ...["jpg", "jpeg", "png", "webp", "gif", "ico", "pdf", "woff", "woff2"].map((ext) => `:(exclude,glob)**/*.${ext}`),
];

// Measured on 2026-11-18: 181 files. A walk below this means the pathspecs broke.
export const HYGIENE_MIN_FILES = 120;

function main(): void {
  const files = readFiles(HYGIENE_PATHSPECS);
  const r = hygieneVerdict(files, HYGIENE_MIN_FILES, { repoPrivate: process.env.REPO_PRIVATE?.trim(), ci: process.env.CI === "true" });
  for (const m of r.messages) console.error(m);
  console.log(`hygiene guard: ${files.length} files, ${r.messages.length} messages, exit ${r.exitCode}`);
  process.exit(r.exitCode);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
