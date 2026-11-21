// The eval's model run (eval/PROTOCOL.md, "Runs"): every eval/set photo read on the device, in the cloud and on
// the route the app ships, judged by the app's own code (src/eval/runner.ts) in Chrome with its built-in model.
// It runs only against an eval Firebase project named in .env.eval.local, never the live one, through the dev-only
// harness page served in Vite's "eval" mode. Writes the full run to eval/runs/private/ (kept private) and its
// public copy, with no label text or item names, to eval/runs/.
//
//   BYT_NANO_PROFILE=<Chrome profile with the model> APPCHECK_DEBUG_TOKEN=<the eval project's debug token> \
//     npx tsx scripts/eval-run.ts --date 2026-11-21 [--items own-01,own-18] [--repeat 3] [--paths device,cloud,shipped]
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { platform, release } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { isCalendarDate } from "../src/engine/edition";
import { buildEvalSet, type SetLabels, type SetManifest } from "../src/eval/loadSet";
import { computeEvalReport, redactRun } from "../src/eval/metrics";
import { ALL_PATHS, type EvalPath } from "../src/eval/runner";
import type { EvalRow, EvalRun, EvalSet } from "../src/eval/types";
import { evalPhotos, machineOf, osName, requireEnv } from "./device-e2e";

const LIVE_PROJECT = "before-you-tape-2026";
const VITE_PORT = 4175;
const DEBUG_PORT = 9237;
const AI_LOGIC_HOST = "firebasevertexai.googleapis.com";

// The project the run will call: named in .env.eval.local, and never the live one.
export function evalProjectId(env: Record<string, string | undefined>): string {
  const id = env.VITE_FB_PROJECT_ID?.trim();
  if (!id) throw new Error("VITE_FB_PROJECT_ID is not set in .env.eval.local; the eval runs only against an eval project");
  if (id === LIVE_PROJECT) throw new Error(`refusing the live project ${LIVE_PROJECT}: the eval runs only against an eval project`);
  return id;
}

// KEY=VALUE lines of a .env file; comments and blank lines are skipped, quotes around a value removed.
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    out[m[1]!] = m[2]!.replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

const REQUIRED = ["VITE_FB_API_KEY", "VITE_FB_AUTH_DOMAIN", "VITE_FB_PROJECT_ID", "VITE_FB_APP_ID", "VITE_RECAPTCHA_SITE_KEY"] as const;

// The eval project's settings, from .env.eval.local alone. Vite fills a key that file leaves out from .env.local, the
// live config, so every key must be set there, and none may be the live project's own.
export function evalEnv(evalFile: string | null, live: Record<string, string>): string {
  if (evalFile === null) throw new Error("no .env.eval.local: the eval runs only against an eval project, set up there");
  const env = parseEnvFile(evalFile);
  for (const k of REQUIRED) if (!env[k]?.trim()) throw new Error(`${k} is not set in .env.eval.local`);
  if (env.VITE_USE_EMULATORS !== "false") throw new Error('VITE_USE_EMULATORS must be "false" in .env.eval.local');
  for (const k of ["VITE_FB_API_KEY", "VITE_FB_APP_ID"] as const) {
    if (live[k] && env[k] === live[k]) throw new Error(`${k} is the live project's: .env.eval.local must hold the eval project's own config`);
  }
  return evalProjectId(env);
}

interface Template { parameters: Record<string, { defaultValue?: { value?: string } }> }
// The cloud models the live app is set to, so the eval reads with the same ones.
export function liveModels(t: Template): { cloud: string; fallback: string } {
  const value = (k: string) => {
    const v = t.parameters[k]?.defaultValue?.value?.trim();
    if (!v) throw new Error(`remoteconfig.template.json has no default for ${k}`);
    return v;
  };
  return { cloud: value("cloud_model_item"), fallback: value("cloud_model_item_fallback") };
}

// Waits for a line matching the pattern and gives the output read so far; fails if the program cannot start, exits,
// or says nothing matching in time.
export function waitForLine(child: ChildProcess, pattern: RegExp, ms: number): Promise<string> {
  return new Promise((done, fail) => {
    let seen = "";
    const timer = setTimeout(() => fail(new Error(`no "${pattern}" within ${ms} ms`)), ms);
    const onData = (b: Buffer) => { seen += b.toString(); if (pattern.test(seen)) { clearTimeout(timer); done(seen); } };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("error", (e) => { clearTimeout(timer); fail(new Error(`could not start: ${e.message}`)); });
    child.once("exit", (code) => { clearTimeout(timer); fail(new Error(`exited early with code ${code}`)); });
  });
}

// The DevTools address the started Chrome announces, so the run attaches to that Chrome and no other.
export function devtoolsUrl(output: string): string {
  const m = /DevTools listening on (ws:\/\/\S+)/.exec(output);
  if (!m) throw new Error("Chrome announced no DevTools address");
  return m[1]!;
}

// The environment Vite starts with: the shell's, without any VITE_ value (Vite would let it win over the files),
// every VITE_ key of the live .env.local set empty (so Vite cannot fill it in), then the eval file's own values.
export function viteEnv(shell: Record<string, string | undefined>, evalFile: string, liveFile: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(shell)) if (v !== undefined && !k.startsWith("VITE_")) out[k] = v;
  for (const k of Object.keys(liveFile === null ? {} : parseEnvFile(liveFile))) if (k.startsWith("VITE_")) out[k] = "";
  return { ...out, ...parseEnvFile(evalFile) };
}

// The full eval run's name only for a run of every path on every item; anything less is named as a partial run.
export function runIdOf(date: string, paths: readonly EvalPath[], items: number, total: number): string {
  return paths.length === ALL_PATHS.length && items === total ? `models-${date}` : `partial-${paths.join("-")}-${items}of${total}-${date}`;
}

// A Google API response, for the private run record: host, path, status and the error message, never the query,
// the body or a token.
export interface ResponseNote { host: string; path: string; status: number; error: string | null }
export function responseNote(url: string, status: number, body: string): ResponseNote {
  const u = new URL(url);
  let error: string | null = null;
  try {
    const e = (JSON.parse(body) as { error?: { message?: unknown; status?: unknown } }).error;
    if (e && typeof e.message === "string") error = `${typeof e.status === "string" ? `${e.status}: ` : ""}${e.message}`.slice(0, 300);
  } catch {
    error = status >= 400 ? "(no JSON error body)" : null;
  }
  return { host: u.hostname, path: u.pathname, status, error };
}

const KEYCHAIN_ITEM = "byt-eval-appcheck-debug-token";

// The eval project's App Check debug token: from the environment, or else from its Keychain item. Never printed.
export function evalToken(env: Record<string, string | undefined>, keychain: (service: string) => string): string {
  const fromEnv = env.APPCHECK_DEBUG_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  let value: string;
  try {
    value = keychain(KEYCHAIN_ITEM);
  } catch {
    throw new Error(`no App Check debug token: set APPCHECK_DEBUG_TOKEN or add the Keychain item ${KEYCHAIN_ITEM}`);
  }
  // `security find-generic-password -w` exits 0 on an item whose value is empty, so the length decides.
  if (value.trim() === "") throw new Error(`the Keychain item ${KEYCHAIN_ITEM} is empty`);
  return value.trim();
}

export interface Preflight { date: string; repeat: number; items: string | undefined; paths: EvalPath[]; project: string; profile: string; token: string }

// Every precondition, checked in order before anything starts; the first that fails stops the run.
export function preflight(i: { argv: string[]; env: Record<string, string | undefined>; file: (path: string) => string | null; keychain: (service: string) => string }): Preflight {
  const arg = (name: string) => { const k = i.argv.indexOf(name); return k >= 0 ? i.argv[k + 1] : undefined; };
  const date = arg("--date") ?? "";
  if (!isCalendarDate(date)) throw new Error("--date must be a real YYYY-MM-DD date");
  // Three timed runs per crop and path, as the protocol's latency section asks.
  const repeat = Number(arg("--repeat") ?? "3");
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 5) throw new Error("--repeat must be a whole number from 1 to 5");
  const paths = (arg("--paths") ?? ALL_PATHS.join(",")).split(",").map((p) => p.trim()) as EvalPath[];
  if (paths.length === 0 || paths.some((p) => !ALL_PATHS.includes(p))) throw new Error(`--paths must name some of ${ALL_PATHS.join(", ")}`);
  if (new Set(paths).size !== paths.length) throw new Error("--paths must name each path once");
  // Any DEBUG value can turn on Playwright's protocol log (a wildcard matches it too), which would record the script
  // that carries the debug token; so the run starts only with DEBUG unset.
  if ((i.env.DEBUG ?? "").trim() !== "") throw new Error("unset DEBUG: a debug log could record the App Check debug token");
  const live = i.file(".env.local");
  const project = evalEnv(i.file(".env.eval.local"), live === null ? {} : parseEnvFile(live));
  const profile = resolve(requireEnv(i.env, "BYT_NANO_PROFILE"));
  const token = evalToken(i.env, i.keychain);
  return { date, repeat, items: arg("--items"), paths, project, profile, token };
}

async function main(): Promise<void> {
  const { date, repeat, items, paths, project, profile, token } = preflight({
    argv: process.argv, env: process.env,
    file: (f) => (existsSync(f) ? readFileSync(f, "utf8") : null),
    keychain: (service) => execFileSync("security", ["find-generic-password", "-s", service, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
  });

  const manifest = JSON.parse(readFileSync("eval/set/manifest.json", "utf8")) as SetManifest;
  const labels = JSON.parse(readFileSync("eval/set/labels.json", "utf8")) as SetLabels;
  const full: EvalSet = buildEvalSet(manifest, labels);
  const ids = items ?? full.items.map((i) => i.itemId).join(",");
  const photos = evalPhotos(ids, manifest, (p) => readFileSync(p), full.items.length);
  const set: EvalSet = { ...full, items: full.items.filter((i) => photos.some((p) => p.itemId === i.itemId)) };
  const edition = JSON.parse(readFileSync("rules/edition.json", "utf8")) as { editionId: string };
  const models = liveModels(JSON.parse(readFileSync("remoteconfig.template.json", "utf8")) as Template);
  console.log(`eval project ${project}, ${set.items.length} items, cloud ${models.cloud} (fallback ${models.fallback}), date ${date}`);

  let vite: ChildProcess | null = null;
  let chrome: ChildProcess | null = null;
  try {
    const evalFile = readFileSync(".env.eval.local", "utf8");
    const liveFile = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : null;
    vite = spawn("npx", ["vite", "--mode", "eval", "--port", String(VITE_PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"], env: viteEnv(process.env, evalFile, liveFile) });
    await waitForLine(vite, /Local:/, 60_000);
    const chromePath = process.env.CHROME_PATH?.trim() || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    chrome = spawn(chromePath, [`--user-data-dir=${profile}`, `--remote-debugging-port=${DEBUG_PORT}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: ["ignore", "pipe", "pipe"] });
    const announced = devtoolsUrl(await waitForLine(chrome, /DevTools listening on ws:\/\/\S+/, 30_000));
    const browser = await chromium.connectOverCDP(announced);
    const chromeVersion = browser.version();
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = await context.newPage();
    let cloudRequests = 0;
    page.on("request", (r) => { if (new URL(r.url()).hostname === AI_LOGIC_HOST) cloudRequests++; });
    const responses: ResponseNote[] = [];
    page.on("response", (r) => {
      const host = new URL(r.url()).hostname;
      if (host !== AI_LOGIC_HOST && host !== "firebaseappcheck.googleapis.com") return;
      void r.text().then((body) => { responses.push(responseNote(r.url(), r.status(), body)); }, () => { responses.push(responseNote(r.url(), r.status(), "")); });
    });
    // The eval project's debug token, only on the local harness page.
    const origin = `http://localhost:${VITE_PORT}`;
    await page.addInitScript(({ t, o }) => { if (location.origin === o) (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = t; }, { t: token, o: origin });
    await page.goto(`${origin}/scripts/device-e2e/harness.html`);
    await page.waitForSelector("body[data-ready='1']", { timeout: 60_000 });
    const result = await page.evaluate((input) => window.bytEvalRun(input), {
      items: photos.map((p) => ({ itemId: p.itemId!, base64: p.base64 })), set, edition, date, repeat, paths, coldCall: true,
      cloudModel: models.cloud, fallbackModel: models.fallback,
    });
    await page.close();
    const cdp = await browser.newBrowserCDPSession();
    await cdp.send("Browser.close").catch(() => undefined);
    await browser.close().catch(() => undefined);

    const machine = machineOf((k) => execFileSync("sysctl", ["-n", k], { encoding: "utf8" }));
    const os = osName(platform(), release(), () => execFileSync("sw_vers", ["-productVersion"], { encoding: "utf8" }));
    const run: EvalRun = {
      // A run of some paths or some items (a wiring check) is named as a partial run and never gets a public copy.
      runId: runIdOf(date, paths, set.items.length, full.items.length), setId: set.setId, date,
      machine: [machine.chip, machine.memoryGb ? `${machine.memoryGb} GB` : "", machine.model, os].filter(Boolean).join(", "),
      chromeVersion, modelShown: `device: Chrome built-in model (gate ${result.gate}); cloud: ${models.cloud}, fallback ${models.fallback}`,
      editionId: edition.editionId, rows: result.rows as EvalRow[],
    };
    const metrics = computeEvalReport(set, run);
    mkdirSync(join("eval", "runs", "private"), { recursive: true });
    writeFileSync(join("eval", "runs", "private", `${run.runId}.json`), JSON.stringify({ ...run, coldMs: result.cold, failures: result.failures, cloudRequests, responses, project }, null, 2) + "\n");
    if (run.runId === `models-${date}`) writeFileSync(join("eval", "runs", `${run.runId}.public.json`), JSON.stringify({ ...redactRun(run, set), coldMs: result.cold, metrics }, null, 2) + "\n");
    console.log(JSON.stringify({ runId: run.runId, failures: result.failures.length, cloudRequests, responses, metrics }, null, 2));
  } finally {
    if (chrome && chrome.exitCode === null && chrome.signalCode === null) chrome.kill();
    vite?.kill();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
