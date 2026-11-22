// Publishes the built rule edition to Firestore at ruleEditions/{editionId} as { editionId, json, sha256 },
// where json is the canonical JSON text, and prints the id and hash to set in Remote Config
// (rules_edition_id, rules_edition_sha256). Clients cannot write there; this writes with the operator's own
// Google Cloud access token through the Firestore REST API, which the security rules do not govern.
//
// Env: ACCESS_TOKEN (for example from `gcloud auth print-access-token`; never printed). Optional: EDITION_FILE.
// Args: [--dry-run] prints the document and the pin and writes nothing (no token needed).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalJson, parseEdition, sha256Hex } from "../src/engine/edition";
import { pinRefusal } from "./pin-guard";

const PROJECT = "before-you-tape-2026";

export interface EditionDocument { id: string; json: string; sha256: string }

// Refuses anything the app itself would refuse to load.
export async function editionDocument(raw: unknown): Promise<EditionDocument> {
  const edition = parseEdition(raw);
  const json = canonicalJson(raw);
  return { id: edition.editionId, json, sha256: await sha256Hex(json) };
}

export function firestoreFields(d: EditionDocument): Record<string, { stringValue: string }> {
  return { editionId: { stringValue: d.id }, json: { stringValue: d.json }, sha256: { stringValue: d.sha256 } };
}

// With --dry-run it prints the document's id, hash and size and writes nothing, so it needs no token.
export async function publishEdition(o: {
  args: readonly string[]; token: string | undefined; raw: unknown; fetch: typeof fetch; log: (line: string) => void; liveFacts?: ReadonlySet<string>;
}): Promise<void> {
  const d = await editionDocument(o.raw);
  const dry = o.args.includes("--dry-run");
  // An edition a live app build would refuse is never written for a pin; a dry run still prints it, for the record.
  const refusal = pinRefusal(o.raw, o.liveFacts);
  if (refusal && !dry) throw new Error(`Refused: ruleEditions/${d.id} cannot be pinned: ${refusal}`);
  if (refusal) o.log(`ruleEditions/${d.id} cannot be pinned: ${refusal}`);
  const token = o.token?.trim();
  if (!dry && !token) throw new Error("ACCESS_TOKEN is not set");
  if (dry) {
    o.log(`ruleEditions/${d.id}: ${new TextEncoder().encode(d.json).length} bytes of canonical JSON; not written (--dry-run)`);
  } else {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/ruleEditions/${encodeURIComponent(d.id)}`;
    const r = await o.fetch(url, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "x-goog-user-project": PROJECT },
      body: JSON.stringify({ fields: firestoreFields(d) }),
    });
    if (!r.ok) throw new Error(`Firestore answered ${r.status}: ${(await r.text()).slice(0, 300)}`);
    o.log(`published ruleEditions/${d.id}`);
  }
  o.log(`rules_edition_id     ${d.id}`);
  o.log(`rules_edition_sha256 ${d.sha256}`);
}

async function main(): Promise<void> {
  const file = process.env.EDITION_FILE?.trim() || "rules/edition.json";
  await publishEdition({
    args: process.argv.slice(2), token: process.env.ACCESS_TOKEN, raw: JSON.parse(readFileSync(file, "utf8")) as unknown,
    fetch, log: (line) => console.log(line),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
