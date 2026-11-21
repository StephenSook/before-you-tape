import { cpSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The shipped /sw.js removes any service worker this site installed, and its caches. A worker from a later release
// is stood in for by a test worker that caches the page and answers from that cache; once the server serves this
// build instead, as a rollback to it would, the browser is left with no worker, no caches and no offline page.
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const LATER_WORKER = `
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open("byt-later").then((c) => c.add("/"))); });
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => { if (e.request.mode === "navigate") e.respondWith(caches.match("/").then((r) => r || fetch(e.request))); });
`;

let later = "";
let root = "";
let server: Server;
let url = "";

test.beforeAll(async () => {
  later = mkdtempSync(join(tmpdir(), "byt-later-"));
  cpSync("dist", later, { recursive: true });
  writeFileSync(join(later, "sw.js"), LATER_WORKER);
  server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    const full = normalize(join(root, path === "/" ? "/index.html" : path));
    const isFile = () => { try { return full.startsWith(normalize(root)) && statSync(full).isFile(); } catch { return false; } };
    if (!isFile()) { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "Content-Type": TYPES[extname(full)] ?? "application/octet-stream", "Cache-Control": "no-cache" }).end(readFileSync(full));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
test.afterAll(async () => { await new Promise<void>((done) => server.close(() => done())); });

const workers = (page: Page) => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length).catch(() => -1);
const cacheNames = (page: Page) => page.evaluate(async () => (await caches.keys()).length).catch(() => -1);

test("the shipped sw.js removes a worker a later release installed, and its caches", async ({ page, context }) => {
  expect(readFileSync("dist/sw.js", "utf8")).toContain("registration.unregister");
  root = later;
  await page.goto(`${url}/`);
  await page.evaluate(async () => { await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  expect(await cacheNames(page)).toBe(1);

  root = "dist";
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update(); }).catch(() => undefined);
  await expect.poll(() => workers(page), { timeout: 30_000 }).toBe(0);
  await expect.poll(() => cacheNames(page), { timeout: 30_000 }).toBe(0);

  await context.setOffline(true);
  await expect(page.reload()).rejects.toThrow(/ERR_INTERNET_DISCONNECTED/);
});
