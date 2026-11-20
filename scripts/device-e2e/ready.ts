// Gets a Chrome profile's built-in model ready through the app's own path, as a judge would: the Pack page's
// "Get this laptop ready" button (src/ui/ReadyButton.tsx). It asks the dev-only harness page for the gate
// state first (the app's own checkGate), clicks the button only when the model is downloadable, and waits a
// bounded time for the page to say "This laptop checks items itself." Prints the gate state at each step and
// exits non-zero when the model is not available at the end.
//
// Env: BYT_NANO_PROFILE (a Chrome profile folder of its own, never one another Chrome holds).
// Optional: CHROME_PATH, BYT_READY_WAIT_MIN (default 40).
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readlinkSync } from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { profileLockState, requireEnv } from "../device-e2e";

const VITE_PORT = 4174;
const DEBUG_PORT = 9235;

function waitForLine(child: ChildProcess, pattern: RegExp, ms: number): Promise<void> {
  return new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error(`no "${pattern}" within ${ms} ms`)), ms);
    const onData = (b: Buffer) => { if (pattern.test(b.toString())) { clearTimeout(timer); done(); } };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("exit", (code) => { clearTimeout(timer); fail(new Error(`exited early with code ${code}`)); });
  });
}

const isAlive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const readLock = (profile: string) => { try { return readlinkSync(join(profile, "SingletonLock")); } catch { return null; } };

async function main(): Promise<void> {
  const profile = resolve(requireEnv(process.env, "BYT_NANO_PROFILE"));
  mkdirSync(profile, { recursive: true });
  if (profileLockState(readLock(profile), hostname(), isAlive) === "in_use") throw new Error("the Chrome profile is in use by another Chrome; not touching it");
  const waitMin = Number(process.env.BYT_READY_WAIT_MIN ?? "40");
  const chromePath = process.env.CHROME_PATH?.trim() || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  let vite: ChildProcess | null = null;
  let chrome: ChildProcess | null = null;
  try {
    vite = spawn("npx", ["vite", "--port", String(VITE_PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
    await waitForLine(vite, /Local:/, 60_000);
    chrome = spawn(chromePath, [`--user-data-dir=${profile}`, `--remote-debugging-port=${DEBUG_PORT}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: ["ignore", "pipe", "pipe"] });
    await waitForLine(chrome, /DevTools listening/, 30_000);
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
    console.log(`Chrome ${browser.version()}`);
    const context = browser.contexts()[0] ?? (await browser.newContext());

    const gate = async () => {
      const h = await context.newPage();
      await h.goto(`http://localhost:${VITE_PORT}/scripts/device-e2e/harness.html`);
      await h.waitForSelector("body[data-ready='1']", { timeout: 60_000 });
      const g = await h.evaluate(async () => (await window.bytDeviceE2E([])).gate);
      await h.close();
      return g;
    };
    let state = await gate();
    console.log(`gate at start: ${state}`);
    if (state === "downloadable") {
      const page = await context.newPage();
      await page.goto(`http://localhost:${VITE_PORT}/`);
      const button = page.getByTestId("ready-button");
      await button.waitFor({ timeout: 60_000 });
      await button.click();
      console.log("pressed \"Get this laptop ready\"");
      await page.getByText("This laptop checks items itself.").waitFor({ timeout: waitMin * 60_000 });
      const bar = await page.getByRole("progressbar").count();
      console.log(`the page says the laptop checks items itself (progress bar still shown: ${bar > 0})`);
      await page.close();
      state = await gate();
      console.log(`gate after the download: ${state}`);
    }
    const cdp = await browser.newBrowserCDPSession();
    await cdp.send("Browser.close").catch(() => undefined);
    await browser.close().catch(() => undefined);
    process.exitCode = state === "available" ? 0 : 2;
  } finally {
    if (chrome && chrome.exitCode === null && chrome.signalCode === null) chrome.kill();
    vite?.kill();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
