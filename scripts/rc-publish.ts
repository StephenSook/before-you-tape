// The only way the Remote Config template is published (firebase.json does not name it). It reads the live
// template and its ETag, prints what would change, and refuses to change or drop any live value (such as a
// kill_cloud an operator turned on) unless that key is named with --allow KEY. Then it validates the
// template with the API and publishes it with If-Match, so a template changed by someone else in between
// is never overwritten.
//
// Env: ACCESS_TOKEN (for example from `gcloud auth print-access-token`; never printed).
// Args: [--dry-run] [--allow KEY]... [--set KEY=VALUE]...
// --set gives a template key a value for this publish only, so an operator value such as the rule edition pin
// (rules_edition_id, rules_edition_sha256) goes live while the template keeps the app's own defaults; a key
// named by --set is allowed to change.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalJson, sha256Hex } from "../src/engine/edition";
import { checkPinSet, checkTemplatePin } from "./pin-guard";

const PROJECT = "before-you-tape-2026";
const URL = `https://firebaseremoteconfig.googleapis.com/v1/projects/${PROJECT}/remoteConfig`;

interface RcParameter { defaultValue?: { value?: string }; valueType?: string; description?: string; conditionalValues?: Record<string, unknown> }
export interface RcTemplate { parameters?: Record<string, RcParameter>; conditions?: unknown[]; version?: { versionNumber?: string } }

export interface PublishPlan {
  added: string[];
  changed: Array<{ key: string; live: string; local: string }>;
  dropped: string[];
  same: string[];
}

const valueOf = (p: RcParameter) => p.defaultValue?.value ?? "";
// What a client would see: the value, its type and any conditional values. A new description is not a change.
const seen = (p: RcParameter) => JSON.stringify([valueOf(p), p.valueType ?? "STRING", p.conditionalValues ?? null]);

export function planPublish(live: RcTemplate, local: RcTemplate): PublishPlan {
  const l = live.parameters ?? {};
  const n = local.parameters ?? {};
  const plan: PublishPlan = { added: [], changed: [], dropped: [], same: [] };
  for (const key of Object.keys(n).sort()) {
    const was = l[key];
    if (!was) plan.added.push(key);
    else if (seen(was) !== seen(n[key]!)) plan.changed.push({ key, live: valueOf(was), local: valueOf(n[key]!) });
    else plan.same.push(key);
  }
  for (const key of Object.keys(l).sort()) if (!(key in n)) plan.dropped.push(key);
  return plan;
}

// Each --set KEY=VALUE, in order; a later one for the same key wins.
export function parseSets(args: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  args.forEach((a, i) => {
    if (a !== "--set") return;
    const kv = args[i + 1] ?? "";
    const at = kv.indexOf("=");
    if (at <= 0) throw new Error(`--set needs KEY=VALUE, got ${JSON.stringify(kv)}`);
    out[kv.slice(0, at)] = kv.slice(at + 1);
  });
  return out;
}

// The template with each set key's value replaced; a key the template does not hold is refused.
export function applySets(t: RcTemplate, sets: Record<string, string>): RcTemplate {
  const parameters = { ...(t.parameters ?? {}) };
  for (const [key, value] of Object.entries(sets)) {
    const p = parameters[key];
    if (!p) throw new Error(`--set ${key}: the template has no such key`);
    parameters[key] = { ...p, defaultValue: { ...(p.defaultValue ?? {}), value } };
  }
  return { ...t, parameters };
}

// Every live value that would change or vanish, unless named in allow.
export function refusals(plan: PublishPlan, allow: ReadonlySet<string>): string[] {
  return [...plan.changed.map((c) => c.key), ...plan.dropped].filter((k) => !allow.has(k)).sort();
}

async function call(method: "GET" | "PUT", token: string, opts: { body?: unknown; etag?: string; validateOnly?: boolean } = {}) {
  const r = await fetch(opts.validateOnly ? `${URL}?validateOnly=true` : URL, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": PROJECT,
      "Content-Type": "application/json; UTF8",
      // The API sends the ETag only on a compressed response.
      "Accept-Encoding": "gzip",
      ...(opts.etag ? { "If-Match": opts.etag } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Remote Config ${method}${opts.validateOnly ? " (validate only)" : ""} answered ${r.status}: ${text.slice(0, 300)}`);
  return { body: JSON.parse(text) as RcTemplate, etag: r.headers.get("etag") };
}

async function main(): Promise<void> {
  const token = process.env.ACCESS_TOKEN?.trim();
  if (!token) throw new Error("ACCESS_TOKEN is not set");
  const args = process.argv.slice(2);
  const sets = parseSets(args);
  // A pin may only name this checkout's edition, and only one every live app build's engine can read.
  const edition = JSON.parse(readFileSync("rules/edition.json", "utf8")) as { editionId: string };
  checkPinSet(sets, edition);
  const allow = new Set([...args.flatMap((a, i) => (a === "--allow" && args[i + 1] ? [args[i + 1]!] : [])), ...Object.keys(sets)]);
  const local = applySets(JSON.parse(readFileSync("remoteconfig.template.json", "utf8")) as RcTemplate, sets);
  // The same for the pin the whole template would publish, with or without --set.
  checkTemplatePin(local, edition, await sha256Hex(canonicalJson(edition)));

  const live = await call("GET", token);
  if (!live.etag) throw new Error("the live template came back with no ETag; nothing was published");
  const plan = planPublish(live.body, local);
  console.log(`live version ${live.body.version?.versionNumber ?? "?"}`);
  for (const k of plan.added) console.log(`  add     ${k}`);
  for (const c of plan.changed) console.log(`  change  ${c.key}: ${JSON.stringify(c.live)} -> ${JSON.stringify(c.local)}${c.key in sets ? " (set)" : allow.has(c.key) ? " (allowed)" : ""}`);
  for (const k of plan.dropped) console.log(`  drop    ${k}${allow.has(k) ? " (allowed)" : ""}`);
  console.log(`  same    ${plan.same.length} keys`);

  const refused = refusals(plan, allow);
  if (refused.length > 0) {
    console.error(`Refused: this would change or drop live values for ${refused.join(", ")}. Rerun with --allow KEY for each one you mean.`);
    process.exit(1);
  }
  if (plan.added.length + plan.changed.length + plan.dropped.length === 0) {
    console.log("Nothing to publish.");
    return;
  }
  const body = { ...local, conditions: live.body.conditions ?? [] };
  await call("PUT", token, { body, etag: live.etag, validateOnly: true });
  if (args.includes("--dry-run")) {
    console.log("Validated; not published (--dry-run).");
    return;
  }
  const out = await call("PUT", token, { body, etag: live.etag });
  console.log(`published version ${out.body.version?.versionNumber ?? "?"}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
