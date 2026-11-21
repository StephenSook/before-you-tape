// One-time backfill of expiresAt on boxes, items and disputes saved before box expiry existed, so Firestore's TTL
// policy can delete them. A box gets its creation time plus 37 days; each item and disputes document gets its box's.
// It reads only each document's name, creation time and expiresAt (never contents), with the signed-in gcloud
// account's token, and by default only prints counts. Writes need --apply.
//
//   npx tsx scripts/backfill-expiry.ts --project before-you-tape-2026            (dry run: counts only)
//   npx tsx scripts/backfill-expiry.ts --project before-you-tape-2026 --apply    (writes)
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BOX_DAYS = 37;
const DAY_MS = 86_400_000;

export interface StoredDoc { path: string; createTime: string; expiresAt?: string }
export interface Counts { total: number; missing: number }
export interface Plan {
  writes: Array<{ path: string; expiresAt: string }>;
  counts: { boxes: Counts; items: Counts; disputes: Counts; boxesAlreadyPast: number };
}

const boxOf = (path: string) => path.split("/").slice(0, 2).join("/");
const count = (docs: StoredDoc[]): Counts => ({ total: docs.length, missing: docs.filter((d) => !d.expiresAt).length });

export function planExpiry(boxes: StoredDoc[], items: StoredDoc[], disputes: StoredDoc[], now: number): Plan {
  const writes: Plan["writes"] = [];
  const expiryOfBox = new Map<string, string>();
  let boxesAlreadyPast = 0;
  for (const b of boxes) {
    const created = Date.parse(b.createTime);
    const expiresAt = b.expiresAt ?? new Date((Number.isFinite(created) ? created : now) + BOX_DAYS * DAY_MS).toISOString();
    expiryOfBox.set(b.path, expiresAt);
    if (!b.expiresAt) writes.push({ path: b.path, expiresAt });
    if (Date.parse(expiresAt) < now) boxesAlreadyPast++;
  }
  // An item or dispute takes its box's expiry; one whose box is gone gets now plus 37 days.
  const fallback = new Date(now + BOX_DAYS * DAY_MS).toISOString();
  for (const d of [...items, ...disputes]) {
    if (!d.expiresAt) writes.push({ path: d.path, expiresAt: expiryOfBox.get(boxOf(d.path)) ?? fallback });
  }
  return { writes, counts: { boxes: count(boxes), items: count(items), disputes: count(disputes), boxesAlreadyPast } };
}

interface QueryRow { document?: { name: string; createTime: string; fields?: { expiresAt?: { timestampValue?: string } } } }

async function list(base: string, headers: Record<string, string>, collectionId: string): Promise<StoredDoc[]> {
  const res = await fetch(`${base}:runQuery`, {
    method: "POST", headers,
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId, allDescendants: true }], select: { fields: [{ fieldPath: "expiresAt" }] } } }),
  });
  if (!res.ok) throw new Error(`listing ${collectionId}: HTTP ${res.status}`);
  const rows = (await res.json()) as QueryRow[];
  return rows.flatMap((r) => (r.document ? [{
    path: r.document.name.slice(r.document.name.indexOf("/documents/") + "/documents/".length),
    createTime: r.document.createTime,
    ...(r.document.fields?.expiresAt?.timestampValue ? { expiresAt: r.document.fields.expiresAt.timestampValue } : {}),
  }] : []));
}

async function main() {
  const args = process.argv.slice(2);
  const project = args[args.indexOf("--project") + 1];
  if (!args.includes("--project") || !project) throw new Error("say which project: --project <id>");
  const apply = args.includes("--apply");
  const token = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "x-goog-user-project": project };
  const root = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
  const plan = planExpiry(await list(root, headers, "boxes"), await list(root, headers, "items"), await list(root, headers, "disputes"), Date.now());
  // Counts only: no document ids or contents.
  console.log(JSON.stringify({ project, mode: apply ? "apply" : "dry run", ...plan.counts, writes: plan.writes.length }));
  if (!apply) return;
  for (let i = 0; i < plan.writes.length; i += 400) {
    const writes = plan.writes.slice(i, i + 400).map((w) => ({
      update: { name: `projects/${project}/databases/(default)/documents/${w.path}`, fields: { expiresAt: { timestampValue: w.expiresAt } } },
      updateMask: { fieldPaths: ["expiresAt"] },
      currentDocument: { exists: true },
    }));
    const res = await fetch(`${root}:commit`, { method: "POST", headers, body: JSON.stringify({ writes }) });
    if (!res.ok) throw new Error(`writing batch ${i / 400 + 1}: HTTP ${res.status}`);
  }
  console.log(JSON.stringify({ written: plan.writes.length }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
}
