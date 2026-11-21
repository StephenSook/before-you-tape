import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startBuildServer, type BuildServer } from "./swServer";

// The kill switch: a build made with BYT_SW_KILL=1 ships a worker that unregisters itself and deletes its caches.
// Deployed over a site whose worker is installed, it leaves the browser with no worker and no cached app, so the
// next visit is served by the network alone. The deploy reads BYT_SW_KILL from the repository variable.
let kill = "";
let stuck = "";
// A stand-in for a kill worker stopped part way through its cleanup: it took over, and removed nothing.
const STUCK_WORKER = `
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
`;
let server: BuildServer;

test.beforeAll(() => {
  kill = mkdtempSync(join(tmpdir(), "byt-sw-kill-"));
  execFileSync("npx", ["vite", "build", "--outDir", kill, "--emptyOutDir", "--logLevel", "error"], {
    env: { ...process.env, BYT_SW_KILL: "1" }, stdio: ["ignore", "ignore", "inherit"],
  });
  stuck = mkdtempSync(join(tmpdir(), "byt-sw-stuck-"));
  cpSync(kill, stuck, { recursive: true });
  writeFileSync(join(stuck, "sw.js"), STUCK_WORKER);
});
test.beforeEach(async () => { server = await startBuildServer("dist"); });
test.afterEach(async () => { await server.close(); });
test.setTimeout(120_000);

const workers = (page: Page) => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length).catch(() => -1);
const cacheNames = (page: Page) => page.evaluate(async () => (await caches.keys()).length).catch(() => -1);

test("the kill build's worker removes an installed worker and its caches", async ({ page, context }) => {
  // The same worker built with no files to cache: a different file from the shipped one.
  expect(readFileSync(join(kill, "sw.js"), "utf8")).not.toBe(readFileSync("dist/sw.js", "utf8"));

  await page.goto(`${server.url}/`);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  expect(await cacheNames(page)).toBeGreaterThan(0);

  server.serve(kill);
  await page.reload();
  await expect.poll(() => workers(page), { timeout: 30_000 }).toBe(0);
  await expect.poll(() => cacheNames(page), { timeout: 30_000 }).toBe(0);

  await context.setOffline(true);
  await expect(page.reload()).rejects.toThrow(/ERR_INTERNET_DISCONNECTED/);
});

// The kill build's page removes workers and caches itself, on every load: a kill worker that stopped before its
// cleanup still leaves the browser clean once the page opens.
test("the kill build's page removes a worker that never cleaned up", async ({ page, context }) => {
  await page.goto(`${server.url}/`);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  expect(await cacheNames(page)).toBeGreaterThan(0);

  server.serve(stuck);
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update(); });
  await page.reload();
  await expect.poll(() => workers(page), { timeout: 30_000 }).toBe(0);
  await expect.poll(() => cacheNames(page), { timeout: 30_000 }).toBe(0);

  await context.setOffline(true);
  await expect(page.reload()).rejects.toThrow(/ERR_INTERNET_DISCONNECTED/);
});

