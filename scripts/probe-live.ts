// Daily live probe for the judging window, with no credential: the site serves main, the page loads,
// robots.txt and llms.txt are plain text, the models page still lists each allowed model with no Gemini
// Developer API shutdown before the window ends, and Firebase AI Logic refuses a call that carries the
// public web key but no App Check token. The two app-link files the phones verify are the repository's,
// served as JSON with no redirect, and the two join callables refuse a call with no App Check token.
// Retires itself after the last judging day.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CLOUD_MODELS } from "../src/config/models";

export const PROBE_RETIRES_AFTER = "2026-12-17";
const DEFAULT_SITE = "https://before-you-tape-2026.web.app";
const MODELS_PAGE = "https://firebase.google.com/docs/ai-logic/models.md.txt";
const WINDOW_END = Date.parse(`${PROBE_RETIRES_AFTER}T23:59:59Z`);

export const probeRetired = (today: string): boolean => today > PROBE_RETIRES_AFTER;

export const isPlainText = (contentType: string | null): boolean => /^text\/plain(\s*;|$)/i.test(contentType?.trim() ?? "");

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The model's own table row, then its Gemini Developer API cell. Routed, replaced, or shut down before the
// window ends all fail.
export function modelStatus(page: string, id: string): { ok: boolean; detail: string } {
  const row = new RegExp(`^\\|\\s*\`${escape(id)}\`(?=[\\s^])[^\\n]*$`, "m").exec(page)?.[0];
  if (!row) return { ok: false, detail: "not listed on the models page" };
  const dev = row.split("|").map((c) => c.trim())[2] ?? "";
  if (/requests routed|replacement/i.test(dev)) return { ok: false, detail: dev };
  if (dev === "Shutdown date: ---") return { ok: true, detail: dev };
  const date = /^Shutdown date: (.+)$/.exec(dev)?.[1];
  const when = date ? Date.parse(`${date} 23:59:59 UTC`) : NaN;
  return { ok: Number.isFinite(when) && when > WINDOW_END, detail: dev };
}

const AI_LOGIC = "https://firebasevertexai.googleapis.com/v1beta/projects/before-you-tape-2026/models";
const APP_CHECK_REFUSAL = "Firebase App Check token is invalid.";

// App Check is enforced only if a call with no App Check token is refused with exactly that message;
// any answer, or any other refusal (a bad key, a blocked referrer), does not show it.
export function appCheckRefusal(status: number, body: unknown): { ok: boolean; detail: string } {
  const message = (body as { error?: { message?: unknown } } | null)?.error?.message;
  const text = typeof message === "string" ? message : "no error message";
  return { ok: status === 401 && text === APP_CHECK_REFUSAL, detail: `HTTP ${status}: ${text}` };
}

// The phones fetch these on the exact host and accept no redirect; Android also needs JSON.
const APP_LINK_FILES = ["/.well-known/assetlinks.json", "/.well-known/apple-app-site-association"] as const;

export function appLinkFile(
  r: { status: number; redirected: boolean; contentType: string | null; body: string }, expected: unknown,
): { ok: boolean; detail: string } {
  let same: boolean;
  try {
    same = JSON.stringify(JSON.parse(r.body)) === JSON.stringify(expected);
  } catch {
    same = false;
  }
  const json = /^application\/json(\s*;|$)/i.test(r.contentType?.trim() ?? "");
  const detail = `HTTP ${r.status}, ${r.contentType}${r.redirected ? ", redirected" : ""}${same ? "" : ", not the repository's file"}`;
  return { ok: r.status === 200 && !r.redirected && json && same, detail };
}

const FUNCTIONS = "https://us-central1-before-you-tape-2026.cloudfunctions.net";
const CALLABLES = ["startJoin", "joinBox"] as const;

// A callable enforces App Check only if a call with no token gets its own refusal; any answer, a missing
// function, or another refusal does not show it.
export function callableRefusal(status: number, body: unknown): { ok: boolean; detail: string } {
  const s = (body as { error?: { status?: unknown } } | null)?.error?.status;
  const text = typeof s === "string" ? s : "no error status";
  return { ok: status === 401 && text === "UNAUTHENTICATED", detail: `HTTP ${status}: ${text}` };
}

async function get(url: string): Promise<Response> {
  return fetch(url, { headers: { "Cache-Control": "no-cache", "User-Agent": "before-you-tape-probe" }, signal: AbortSignal.timeout(20_000) });
}

async function main(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (probeRetired(today)) {
    console.log(`The probe retired after ${PROBE_RETIRES_AFTER}. Delete .github/workflows/probe-live.yml.`);
    return;
  }
  const site = (process.env.PROBE_SITE?.trim() || DEFAULT_SITE).replace(/\/+$/, "");
  const mainSha = process.env.MAIN_SHA?.trim() ?? "";
  const results: Array<{ check: string; ok: boolean; detail: string }> = [];
  const check = async (name: string, run: () => Promise<{ ok: boolean; detail: string }>) => {
    try {
      results.push({ check: name, ...(await run()) });
    } catch (e) {
      results.push({ check: name, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  };

  await check("version.json is main", async () => {
    const v = (await (await get(`${site}/version.json`)).json()) as { sha?: string; dirty?: boolean };
    return { ok: /^[0-9a-f]{40}$/.test(mainSha) && v.sha === mainSha && v.dirty === false, detail: `live ${v.sha} dirty ${v.dirty}, main ${mainSha || "unknown"}` };
  });
  await check("the page loads", async () => {
    const r = await get(`${site}/`);
    const html = await r.text();
    return { ok: r.status === 200 && html.includes("<title>Before You Tape</title>"), detail: `HTTP ${r.status}, ${html.length} bytes` };
  });
  for (const path of ["/robots.txt", "/llms.txt"]) {
    await check(`${path} is plain text`, async () => {
      const r = await get(`${site}${path}`);
      const type = r.headers.get("content-type");
      return { ok: r.status === 200 && isPlainText(type), detail: `HTTP ${r.status}, ${type}` };
    });
  }
  for (const path of APP_LINK_FILES) {
    await check(`${path} is the repository's file, as JSON`, async () => {
      const r = await fetch(`${site}${path}`, { redirect: "manual", headers: { "Cache-Control": "no-cache", "User-Agent": "before-you-tape-probe" }, signal: AbortSignal.timeout(20_000) });
      const expected: unknown = JSON.parse(readFileSync(resolve("public", `.${path}`), "utf8"));
      return appLinkFile({ status: r.status, redirected: r.redirected, contentType: r.headers.get("content-type"), body: await r.text() }, expected);
    });
  }
  for (const name of CALLABLES) {
    await check(`${name} refuses a call with no App Check token`, async () => {
      const r = await fetch(`${FUNCTIONS}/${name}`, {
        method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "before-you-tape-probe" },
        body: JSON.stringify({ data: { boxId: "probe" } }), signal: AbortSignal.timeout(20_000),
      });
      return callableRefusal(r.status, await r.json().catch(() => null));
    });
  }
  // The public web key and the site as referrer, and no App Check token: the call must be refused.
  await check("AI Logic refuses a call with no App Check token", async () => {
    const key = process.env.PROBE_API_KEY?.trim();
    if (!key) return { ok: false, detail: "PROBE_API_KEY is not set" };
    const r = await fetch(`${AI_LOGIC}/${CLOUD_MODELS[0].name}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key, Referer: `${site}/`, "User-Agent": "before-you-tape-probe" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Say ok." }] }] }),
      signal: AbortSignal.timeout(20_000),
    });
    return appCheckRefusal(r.status, await r.json().catch(() => null));
  });
  const models = await (await get(MODELS_PAGE)).text().catch(() => "");
  for (const m of CLOUD_MODELS) await check(`${m.name} on the models page`, async () => modelStatus(models, m.name));

  for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.check}: ${r.detail}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`probe: ${results.length} checks, ${failed} failed`);
  if (failed > 0 || results.length < 5 + APP_LINK_FILES.length + CALLABLES.length + CLOUD_MODELS.length) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
