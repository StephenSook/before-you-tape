// Admin side of the private blind check, with the operator's own Google Cloud access token over the
// Firestore REST API (the security rules do not govern it).
//   --new --set <setId>                 mint one session and print its link (one per reviewer, never reused)
//   --export --token <t> --out <path>   write the calls to a file OUTSIDE the repository, then lock the session
// Env: ACCESS_TOKEN (for example from `gcloud auth print-access-token`; never printed).
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot } from "./lib/files";

const PROJECT = "before-you-tape-2026";
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const SITE = "https://before-you-tape-2026.web.app";

// 24 random bytes as base64url: 32 characters, about 192 bits.
export const newToken = (): string => randomBytes(24).toString("base64url");
export const blindLink = (token: string): string => `${SITE}/blind/${token}`;

export function sessionFields(setId: string, now: Date) {
  return { setId: { stringValue: setId }, createdAt: { timestampValue: now.toISOString() }, lockedAt: { nullValue: null } };
}

// Nothing about a reviewer may enter the repository, so the export must land outside it.
export function assertOutsideRepo(outPath: string, root: string): void {
  const rel = relative(resolve(root), resolve(outPath));
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) throw new Error(`refusing to write inside the repository: ${outPath}`);
}

interface RestValue { stringValue?: string; timestampValue?: string }
export interface ExportedCall { itemId: string; destination: string; call: string; at: string | null }

export function callsFromRest(body: { documents?: Array<{ fields?: Record<string, RestValue> }> }): ExportedCall[] {
  const out: ExportedCall[] = [];
  for (const d of body.documents ?? []) {
    const f = d.fields ?? {};
    const itemId = f.itemId?.stringValue;
    const destination = f.destination?.stringValue;
    const call = f.call?.stringValue;
    if (itemId && destination && call) out.push({ itemId, destination, call, at: f.at?.timestampValue ?? null });
  }
  return out;
}

async function rest(method: string, url: string, token: string, body?: unknown) {
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "x-goog-user-project": PROJECT },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Firestore ${method} answered ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text || "{}") as Record<string, unknown>;
}

const arg = (args: string[], name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main(): Promise<void> {
  const token = process.env.ACCESS_TOKEN?.trim();
  if (!token) throw new Error("ACCESS_TOKEN is not set");
  const args = process.argv.slice(2);
  if (args.includes("--new")) {
    const setId = arg(args, "--set");
    if (!setId) throw new Error("--set <setId> is required");
    const session = newToken();
    await rest("POST", `${DOCS}/blindSessions?documentId=${session}`, token, { fields: sessionFields(setId, new Date()) });
    console.log(blindLink(session));
    return;
  }
  if (args.includes("--export")) {
    const session = arg(args, "--token");
    const out = arg(args, "--out");
    if (!session || !out) throw new Error("--token <t> and --out <path> are required");
    assertOutsideRepo(out, repoRoot());
    const calls: ExportedCall[] = [];
    let pageToken = "";
    do {
      const page = await rest("GET", `${DOCS}/blindSessions/${session}/calls?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ""}`, token);
      calls.push(...callsFromRest(page as Parameters<typeof callsFromRest>[0]));
      pageToken = typeof page.nextPageToken === "string" ? page.nextPageToken : "";
    } while (pageToken);
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(resolve(out), JSON.stringify({ token: session, exportedAt: new Date().toISOString(), calls }, null, 2) + "\n");
    await rest("PATCH", `${DOCS}/blindSessions/${session}?updateMask.fieldPaths=lockedAt`, token, { fields: { lockedAt: { timestampValue: new Date().toISOString() } } });
    console.log(`exported ${calls.length} calls to ${out}; session locked`);
    return;
  }
  throw new Error("use --new --set <setId>, or --export --token <t> --out <path>");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
