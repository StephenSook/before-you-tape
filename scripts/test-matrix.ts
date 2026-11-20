// Checks docs/TEST-MATRIX.md: every evidence file it names is tracked in git, a row with no evidence says
// so in its result, and each "`<mode>` at `<file>:<line>`" still finds that mode on that line of that file.

export const COLUMNS = ["Platform", "Path", "Mode and code", "Model, as recorded", "Hardware, OS, browser", "Channel", "Date", "Result", "Evidence"];
const NO_EVIDENCE_RESULTS = ["No tracked run yet", "Not part of this entry"];

// The table's body rows, each as its cells (trimmed); the header and its separator row are skipped.
export function matrixRows(markdown: string): string[][] {
  const lines = markdown.split("\n").filter((l) => l.trim().startsWith("|"));
  return lines.slice(2).map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
}

const ticked = (cell: string) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);

export function matrixProblems(markdown: string, isTracked: (path: string) => boolean, lineOf: (file: string, line: number) => string | null): string[] {
  const problems: string[] = [];
  const header = markdown.split("\n").find((l) => l.trim().startsWith("|"));
  const headerCells = header ? header.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()) : [];
  if (headerCells.join("|") !== COLUMNS.join("|")) problems.push(`the header is not ${COLUMNS.join(" | ")}`);
  const rows = matrixRows(markdown);
  if (rows.length === 0) problems.push("the table has no rows");
  for (const cells of rows) {
    const name = `${cells[0]}, ${cells[1]}`;
    if (cells.length !== COLUMNS.length) { problems.push(`${name}: ${cells.length} cells, not ${COLUMNS.length}`); continue; }
    const [, , mode, , , , , result, evidence] = cells as [string, string, string, string, string, string, string, string, string];
    if (evidence === "None") {
      if (!NO_EVIDENCE_RESULTS.includes(result)) problems.push(`${name}: no evidence, so the result must say "${NO_EVIDENCE_RESULTS.join('" or "')}"`);
    } else {
      const paths = ticked(evidence);
      if (paths.length === 0) problems.push(`${name}: the evidence names no file`);
      for (const p of paths) if (!isTracked(p)) problems.push(`${name}: ${p} is not tracked in git`);
    }
    const cite = mode.match(/`([^`]+)` at `([^`:]+):(\d+)`/);
    if (cite) {
      const [, token, file, n] = cite as unknown as [string, string, string, string];
      const line = lineOf(file, Number(n));
      if (line === null) problems.push(`${name}: ${file}:${n} does not exist`);
      else if (!line.includes(token)) problems.push(`${name}: ${file}:${n} no longer holds ${token}`);
    }
  }
  return problems;
}
