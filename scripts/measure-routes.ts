// Measures the totals /ran shows from the route records saved boxes already hold. It reads only each item's
// readSource, readMs, secondLook and readFallback, and the number of boxes, with the signed-in gcloud account's
// token, and prints the totals; --write puts them in src/ran/measured.json. Nothing in that file names a box, an
// item or what it is, and any total under 5 is written as "fewer than 5" (src/ran/summarize.ts).
//
//   npx tsx scripts/measure-routes.ts --project before-you-tape-2026            (prints the totals)
//   npx tsx scripts/measure-routes.ts --project before-you-tape-2026 --write    (writes src/ran/measured.json)
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { summarizeRoutes, type RouteRow } from "../src/ran/summarize";
import { repoRoot } from "./lib/files";

type Value = { stringValue?: string; integerValue?: string; doubleValue?: number; nullValue?: null; mapValue?: { fields?: Record<string, Value> } };
interface QueryRow { document?: { name: string; createTime: string; fields?: Record<string, Value> } }

const num = (v: Value | undefined): number | null => {
  if (v?.integerValue !== undefined) return Number(v.integerValue);
  if (typeof v?.doubleValue === "number") return v.doubleValue;
  return null;
};

// The rows come straight from the API's JSON reply, so they are read as unknown and checked field by field.
export function rowsFromQuery(rows: readonly unknown[]): RouteRow[] {
  return rows.flatMap((raw) => {
    const r = (raw ?? {}) as QueryRow;
    const f = r.document?.fields;
    const readSource = f?.readSource?.stringValue;
    if (!r.document || !f || !readSource) return [];
    const look = f.secondLook?.mapValue?.fields;
    const fallback = f.readFallback?.mapValue?.fields;
    return [{
      readSource,
      readMs: num(f.readMs) ?? 0,
      secondLookMs: look ? num(look.ms) : null,
      fallback: fallback?.after?.stringValue && fallback.route?.stringValue ? { after: fallback.after.stringValue, route: fallback.route.stringValue } : null,
      createTime: r.document.createTime,
    }];
  });
}

async function query(root: string, headers: Record<string, string>, collectionId: string, fields: string[]): Promise<QueryRow[]> {
  const res = await fetch(`${root}:runQuery`, {
    method: "POST", headers,
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId, allDescendants: true }], select: { fields: fields.map((fieldPath) => ({ fieldPath })) } } }),
  });
  if (!res.ok) throw new Error(`listing ${collectionId}: HTTP ${res.status}`);
  return (await res.json()) as QueryRow[];
}

async function main() {
  const args = process.argv.slice(2);
  const project = args[args.indexOf("--project") + 1];
  if (!args.includes("--project") || !project) throw new Error("say which project: --project <id>");
  const token = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "x-goog-user-project": project };
  const root = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
  const items = rowsFromQuery(await query(root, headers, "items", ["readSource", "readMs", "secondLook", "readFallback"]));
  const boxes = (await query(root, headers, "boxes", ["expiresAt"])).filter((r) => r.document).length;
  const source = `Route records in the saved boxes of ${project}: each item's read source, read time, second look and fallback, read through the Firestore API`;
  const measured = summarizeRoutes(items, boxes, new Date().toISOString(), source);
  const text = `${JSON.stringify(measured, null, 2)}\n`;
  if (!args.includes("--write")) { process.stdout.write(text); return; }
  writeFileSync(join(repoRoot(), "src", "ran", "measured.json"), text);
  console.log("wrote src/ran/measured.json");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
}
