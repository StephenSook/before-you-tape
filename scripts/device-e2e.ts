// On-device read check (plan Task 16). Starts Chrome on the profile that already holds the on-device
// model, opens a dev-only harness page that runs the app's own read pipeline on the device_only route,
// reads up to three photos, and passes only when every read ran on the device and not one request
// went to the AI Logic cloud host. Writes evidence/device-e2e/<time>.json.
//
// Env: BYT_NANO_PROFILE (Chrome profile with the model), and either BYT_DEVICE_E2E_EVAL_ITEMS (eval/set item
// ids, comma separated: each photo must match its tracked SHA-256) or BYT_DEVICE_E2E_PHOTOS (a folder of .jpg
// files). Optional: BYT_DEVICE_E2E_LABEL (describes the photos in the evidence), CHROME_PATH.
// The record names the Chrome version and the operating system it ran on.
// Never touches a profile another live Chrome holds, and closes the Chrome and dev server it started.
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from "node:fs";
import { hostname, platform, release } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const AI_LOGIC_HOST = "firebasevertexai.googleapis.com";
const VITE_PORT = 4174;
const DEBUG_PORT = 9234;
const MAX_PHOTOS = 3;

export function requireEnv(env: Record<string, string | undefined>, name: string): string {
  const v = env[name]?.trim();
  if (!v) throw new Error(`${name} is not set. Set it and run again; this check never skips.`);
  return v;
}

export type LockState = "free" | "stale" | "in_use";

// Chrome's SingletonLock points at "<host>-<pid>". It is only safe to ignore when it names this machine
// and that process is gone; a lock from another machine cannot be checked, so it counts as in use.
export function profileLockState(target: string | null, host: string, isAlive: (pid: number) => boolean): LockState {
  if (target === null) return "free";
  const m = /^(.+)-(\d+)$/.exec(target);
  if (!m || m[1] !== host) return "in_use";
  return isAlive(Number(m[2])) ? "in_use" : "stale";
}

interface EvalManifest { items: { itemId: string; photo: string; photoSha256: string }[] }
export interface E2EPhoto { file: string; base64: string; itemId?: string }

// Named eval/set photos, read from public/ and checked byte for byte against the manifest, so the record
// says exactly which tracked photo was read.
export function evalPhotos(list: string, manifest: EvalManifest, readFile: (path: string) => Buffer): E2EPhoto[] {
  const ids = list.split(",").map((s) => s.trim()).filter((s) => s !== "");
  if (ids.length === 0) throw new Error("no eval/set item named in BYT_DEVICE_E2E_EVAL_ITEMS");
  if (ids.length > MAX_PHOTOS) throw new Error(`name at most ${MAX_PHOTOS} eval/set items`);
  return ids.map((id) => {
    const item = manifest.items.find((i) => i.itemId === id);
    if (!item) throw new Error(`${id} is not in eval/set/manifest.json`);
    const bytes = readFile(join("public", item.photo));
    if (createHash("sha256").update(bytes).digest("hex") !== item.photoSha256) throw new Error(`${id}: the file does not match its tracked SHA-256`);
    return { file: basename(item.photo), itemId: id, base64: bytes.toString("base64") };
  });
}

// The machine, from sysctl: its model identifier, chip and memory. A value it cannot read is left out, never guessed.
export function machineOf(sysctl: (key: string) => string): { model?: string; chip?: string; memoryGb?: number } {
  const read = (key: string) => { try { return sysctl(key).trim() || undefined; } catch { return undefined; } };
  const out: { model?: string; chip?: string; memoryGb?: number } = {};
  const model = read("hw.model");
  const chip = read("machdep.cpu.brand_string");
  const bytes = Number(read("hw.memsize"));
  if (model) out.model = model;
  if (chip) out.chip = chip;
  if (Number.isFinite(bytes) && bytes > 0) out.memoryGb = Math.round(bytes / 2 ** 30);
  return out;
}

// The operating system as a person would name it: "macOS 27.0" from sw_vers, otherwise the kernel release.
export function osName(os: string, kernel: string, productVersion: () => string): string {
  if (os === "darwin") {
    try { return `macOS ${productVersion().trim()}`; } catch { return `macOS (kernel ${kernel})`; }
  }
  return `${os === "linux" ? "Linux" : os} ${kernel}`;
}

export interface E2ERead { file: string; itemId?: string; source: string | null; ms: number | null; recoveredFrom: string | null; error: string | null }

export function e2ePassed(reads: readonly E2ERead[], cloudRequests: number): boolean {
  return reads.length > 0 && cloudRequests === 0 && reads.every((r) => r.error === null && r.source === "on_device");
}

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function readLock(profile: string): string | null {
  try { return readlinkSync(join(profile, "SingletonLock")); } catch { return null; }
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

async function main(): Promise<void> {
  const profile = resolve(requireEnv(process.env, "BYT_NANO_PROFILE"));
  const evalItems = process.env.BYT_DEVICE_E2E_EVAL_ITEMS?.trim();
  const photosDir = evalItems ? null : resolve(requireEnv(process.env, "BYT_DEVICE_E2E_PHOTOS"));
  for (const p of [profile, photosDir]) {
    if (p && p.split(sep).includes("secrets")) throw new Error(`refusing a path inside a secrets folder: ${p}`);
  }
  const lock = profileLockState(readLock(profile), hostname(), isAlive);
  if (lock === "in_use") throw new Error(`the Chrome profile is in use by another Chrome (${readLock(profile)}); not touching it`);

  const photos: E2EPhoto[] = evalItems
    ? evalPhotos(evalItems, JSON.parse(readFileSync("eval/set/manifest.json", "utf8")) as EvalManifest, (p) => readFileSync(p))
    : readdirSync(photosDir!).filter((f) => /\.jpe?g$/i.test(f)).sort().slice(0, MAX_PHOTOS)
      .map((file) => ({ file, base64: readFileSync(join(photosDir!, file)).toString("base64") }));
  if (photos.length === 0) throw new Error(`no .jpg files in ${photosDir}`);

  const chromePath = process.env.CHROME_PATH?.trim() || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  let vite: ChildProcess | null = null;
  let chrome: ChildProcess | null = null;
  try {
    vite = spawn("npx", ["vite", "--port", String(VITE_PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
    await waitForLine(vite, /Local:/, 60_000);
    chrome = spawn(chromePath, [`--user-data-dir=${profile}`, `--remote-debugging-port=${DEBUG_PORT}`, "--no-first-run", "about:blank"], { stdio: ["ignore", "pipe", "pipe"] });
    await waitForLine(chrome, /DevTools listening/, 30_000);

    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
    const chromeVersion = browser.version();
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = await context.newPage();
    let cloudRequests = 0;
    page.on("request", (r) => { if (new URL(r.url()).hostname === AI_LOGIC_HOST) cloudRequests++; });
    const token = process.env.APPCHECK_DEBUG_TOKEN?.trim();
    if (token) await page.addInitScript((t) => { (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = t; }, token);
    await page.goto(`http://localhost:${VITE_PORT}/scripts/device-e2e/harness.html`);
    await page.waitForSelector("body[data-ready='1']", { timeout: 60_000 });
    const result = await page.evaluate((ps) => window.bytDeviceE2E(ps), photos.map(({ file, base64 }) => ({ file, base64 })));
    await page.close();
    // Quit Chrome the normal way so it releases its profile lock; the finally block is only a fallback.
    const cdp = await browser.newBrowserCDPSession();
    await cdp.send("Browser.close").catch(() => undefined);
    await waitForExit(chrome, 15_000);
    await browser.close().catch(() => undefined);

    const passed = e2ePassed(result.reads, cloudRequests);
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    // dirty: the tree had changes, so the commit alone does not describe the code that ran.
    const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim() !== "";
    const itemOf = new Map(photos.map((p) => [p.file, p.itemId]));
    const reads = result.reads.map((r) => (itemOf.get(r.file) ? { itemId: itemOf.get(r.file), ...r } : r));
    const record = {
      ranAt: new Date().toISOString(), sha, dirty, route: "device_only", gate: result.gate,
      chromeVersion, os: osName(platform(), release(), () => execFileSync("sw_vers", ["-productVersion"], { encoding: "utf8" })),
      machine: machineOf((k) => execFileSync("sysctl", ["-n", k], { encoding: "utf8" })),
      photos: process.env.BYT_DEVICE_E2E_LABEL?.trim() || (evalItems ? `eval/set photos ${photos.map((p) => p.itemId).join(", ")}` : `files from ${basename(photosDir!)}/`),
      reads, cloudRequestsToAiLogic: cloudRequests, passed,
    };
    const dir = join(process.cwd(), "evidence", "device-e2e");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${record.ranAt.replace(/[:.]/g, "-")}.json`);
    writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
    console.log(JSON.stringify(record, null, 2));
    console.log(`wrote ${file}`);
    process.exitCode = passed ? 0 : 1;
  } finally {
    if (chrome && chrome.exitCode === null && chrome.signalCode === null) chrome.kill();
    vite?.kill();
  }
}

function waitForExit(child: ChildProcess, ms: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((done) => {
    const timer = setTimeout(done, ms);
    child.once("exit", () => { clearTimeout(timer); done(); });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
