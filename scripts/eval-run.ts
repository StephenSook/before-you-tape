// The eval's model run (eval/PROTOCOL.md, "Runs"): every eval/set photo read on the device, in the cloud and on
// the route the app ships, judged by the app's own code (src/eval/runner.ts) in Chrome with its built-in model.
// It runs only against an eval Firebase project named in .env.eval.local, never the live one, through the dev-only
// harness page served in Vite's "eval" mode. Writes the full run to eval/runs/private/ (kept private) and its
// public copy, with no label text or item names, to eval/runs/.
//
//   BYT_NANO_PROFILE=<Chrome profile with the model> APPCHECK_DEBUG_TOKEN=<the eval project's debug token> \
//     npx tsx scripts/eval-run.ts --date 2026-11-21 [--items own-01,own-18] [--repeat 1]
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { platform, release } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { isCalendarDate } from "../src/engine/edition";
import { buildEvalSet, type SetLabels, type SetManifest } from "../src/eval/loadSet";
import { computeEvalMetrics, redactRun } from "../src/eval/metrics";
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

function waitForLine(child: ChildProcess, pattern: RegExp, ms: number): Promise<void> {
  return new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error(`no "${pattern}" within ${ms} ms`)), ms);
    const onData = (b: Buffer) => { if (pattern.test(b.toString())) { clearTimeout(timer); done(); } };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("exit", (code) => { clearTimeout(timer); fail(new Error(`exited early with code ${code}`)); });
  });
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

export interface Preflight { date: string; repeat: number; items: string | undefined; project: string; profile: string; token: string }

// Every precondition, checked in order before anything starts; the first that fails stops the run.
export function preflight(i: { argv: string[]; env: Record<string, string | undefined>; file: (path: string) => string | null; keychain: (service: string) => string }): Preflight {
  const arg = (name: string) => { const k = i.argv.indexOf(name); return k >= 0 ? i.argv[k + 1] : undefined; };
  const date = arg("--date") ?? "";
  if (!isCalendarDate(date)) throw new Error("--date must be a real YYYY-MM-DD date");
  const repeat = Number(arg("--repeat") ?? "1");
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 5) throw new Error("--repeat must be a whole number from 1 to 5");
  const live = i.file(".env.local");
  const project = evalEnv(i.file(".env.eval.local"), live === null ? {} : parseEnvFile(live));
  const profile = resolve(requireEnv(i.env, "BYT_NANO_PROFILE"));
  const token = evalToken(i.env, i.keychain);
  return { date, repeat, items: arg("--items"), project, profile, token };
}

async function main(): Promise<void> {
  const { date, repeat, items, project, profile, token } = preflight({
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
    vite = spawn("npx", ["vite", "--mode", "eval", "--port", String(VITE_PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
    await waitForLine(vite, /Local:/, 60_000);
    const chromePath = process.env.CHROME_PATH?.trim() || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    chrome = spawn(chromePath, [`--user-data-dir=${profile}`, `--remote-debugging-port=${DEBUG_PORT}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: ["ignore", "pipe", "pipe"] });
    await waitForLine(chrome, /DevTools listening/, 30_000);
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
    const chromeVersion = browser.version();
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = await context.newPage();
    let cloudRequests = 0;
    page.on("request", (r) => { if (new URL(r.url()).hostname === AI_LOGIC_HOST) cloudRequests++; });
    // The eval project's debug token, only on the local harness page.
    const origin = `http://localhost:${VITE_PORT}`;
    await page.addInitScript(({ t, o }) => { if (location.origin === o) (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = t; }, { t: token, o: origin });
    await page.goto(`${origin}/scripts/device-e2e/harness.html`);
    await page.waitForSelector("body[data-ready='1']", { timeout: 60_000 });
    const result = await page.evaluate((input) => window.bytEvalRun(input), {
      items: photos.map((p) => ({ itemId: p.itemId!, base64: p.base64 })), set, edition, date, repeat,
      cloudModel: models.cloud, fallbackModel: models.fallback,
    });
    await page.close();
    const cdp = await browser.newBrowserCDPSession();
    await cdp.send("Browser.close").catch(() => undefined);
    await browser.close().catch(() => undefined);

    const machine = machineOf((k) => execFileSync("sysctl", ["-n", k], { encoding: "utf8" }));
    const os = osName(platform(), release(), () => execFileSync("sw_vers", ["-productVersion"], { encoding: "utf8" }));
    const run: EvalRun = {
      runId: `models-${date}`, setId: set.setId, date,
      machine: [machine.chip, machine.memoryGb ? `${machine.memoryGb} GB` : "", machine.model, os].filter(Boolean).join(", "),
      chromeVersion, modelShown: `device: Chrome built-in model (gate ${result.gate}); cloud: ${models.cloud}, fallback ${models.fallback}`,
      editionId: edition.editionId, rows: result.rows as EvalRow[],
    };
    const metrics = computeEvalMetrics(set, run);
    mkdirSync(join("eval", "runs", "private"), { recursive: true });
    writeFileSync(join("eval", "runs", "private", `${run.runId}.json`), JSON.stringify({ ...run, failures: result.failures, cloudRequests, project }, null, 2) + "\n");
    writeFileSync(join("eval", "runs", `${run.runId}.public.json`), JSON.stringify({ ...redactRun(run, set), metrics }, null, 2) + "\n");
    console.log(JSON.stringify({ runId: run.runId, failures: result.failures.length, cloudRequests, metrics }, null, 2));
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
