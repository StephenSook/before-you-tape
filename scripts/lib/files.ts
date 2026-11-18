import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface TextFile {
  path: string;
  text: string;
}

export function repoRoot(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
}

// Tracked and untracked (not ignored) files, so a new file is checked before its first commit.
export function listFiles(pathspecs: string[]): string[] {
  const root = repoRoot();
  const out = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...pathspecs],
    { encoding: "utf8", cwd: root },
  );
  return [...new Set(out.split("\0").filter(Boolean))].filter((p) => existsSync(join(root, p))).sort();
}

export function readFiles(pathspecs: string[]): TextFile[] {
  const root = repoRoot();
  return listFiles(pathspecs).map((path) => ({ path, text: readFileSync(join(root, path), "utf8") }));
}

export function lineAndColumn(text: string, index: number): { line: number; column: number } {
  const before = text.slice(0, index);
  const line = before.split("\n").length;
  const column = index - before.lastIndexOf("\n");
  return { line, column };
}
