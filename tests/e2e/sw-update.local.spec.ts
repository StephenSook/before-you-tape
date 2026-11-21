import { cpSync, mkdtempSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { startBuildServer, type BuildServer } from "./swServer";

// A deploy reaching a browser that already has the worker. "Old" is the shipped build. "Next" is the same build as
// the next deploy would differ from it: a changed page and worker, a new version.json, and one lazily loaded chunk
// under a new name, so its old name no longer exists on the server. A tab never reloads without its own tap, and a
// tab still on the old app keeps loading the old app's files after another tab switched to the new version.
const NEXT_SHA = "b".repeat(40);
let next = "";
let oldChunk = "";
let server: BuildServer;

test.beforeAll(() => {
  next = mkdtempSync(join(tmpdir(), "byt-sw-next-"));
  cpSync("dist", next, { recursive: true });
  const lazy = readdirSync(join(next, "assets")).find((f) => /^liveReadDeps-.+\.js$/.test(f));
  expect(lazy, "the build has a lazily loaded chunk to rename").toBeTruthy();
  oldChunk = `/assets/${lazy!}`;
  const renamed = lazy!.replace(/-[^-]+\.js$/, "-next0000.js");
  renameSync(join(next, "assets", lazy!), join(next, "assets", renamed));
  const texts = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? texts(join(dir, e.name)) : [".js", ".html", ".json", ".webmanifest"].includes(extname(e.name)) ? [join(dir, e.name)] : []);
  let replaced = 0;
  for (const f of texts(next)) {
    const t = readFileSync(f, "utf8");
    if (t.includes(lazy!)) { writeFileSync(f, t.split(lazy!).join(renamed)); replaced++; }
  }
  expect(replaced, "the chunk is named by its importer and by the worker").toBeGreaterThanOrEqual(2);
  writeFileSync(join(next, "sw.js"), `${readFileSync(join(next, "sw.js"), "utf8")}\n// next deploy\n`);
  const page = readFileSync(join(next, "index.html"), "utf8");
  writeFileSync(join(next, "index.html"), page.replace("<head>", '<head><meta name="byt-test-build" content="next">'));
  writeFileSync(join(next, "version.json"), `${JSON.stringify({ sha: NEXT_SHA, dirty: false, builtAt: "2026-11-21T00:00:00Z" })}\n`);
});
test.beforeEach(async () => { server = await startBuildServer("dist"); });
test.afterEach(async () => { await server.close(); });
test.setTimeout(60_000);

const servedSha = (page: Page) => page.evaluate(async () => ((await (await fetch("/version.json", { cache: "no-store" })).json()) as { sha: string }).sha);
const isNextPage = (page: Page) => page.locator('meta[name="byt-test-build"]').count();
const mark = (page: Page) => page.evaluate(() => { (window as unknown as { bytStay: string }).bytStay = "open"; });
const stayed = (page: Page) => page.evaluate(() => (window as unknown as { bytStay?: string }).bytStay);
const checkForUpdate = (page: Page) => page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update(); });
async function controlledTab(context: BrowserContext, url: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(url);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  return page;
}

test("a new deploy waits for Reload, then serves the new page and version", async ({ page }) => {
  await page.goto(`${server.url}/`);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  expect(await servedSha(page)).toMatch(/^[0-9a-f]{40}$|^unknown$/);

  server.serve(next);
  await page.reload();
  await mark(page);
  const line = page.getByTestId("update-line");
  await expect(line).toHaveText("A new version is ready. Reload", { timeout: 20_000 });
  // Nothing reloaded the page by itself: it is still the old app, and the same page load.
  expect(await isNextPage(page)).toBe(0);
  expect(await stayed(page)).toBe("open");
  // version.json is never served from the worker, so a version check sees the new deploy at once.
  expect(await servedSha(page)).toBe(NEXT_SHA);

  await line.getByRole("button", { name: "Reload" }).click();
  await expect.poll(() => isNextPage(page), { timeout: 20_000 }).toBe(1);
  expect(await stayed(page)).toBeUndefined();
  await expect(page.getByTestId("update-line")).toHaveCount(0);
  expect(await servedSha(page)).toBe(NEXT_SHA);
});

test("Reload in one tab reloads only that tab; another keeps its page and its old files", async ({ context }) => {
  const a = await controlledTab(context, `${server.url}/`);
  const b = await controlledTab(context, `${server.url}/rules`);
  await mark(a);
  await mark(b);

  server.serve(next);
  await checkForUpdate(b);
  await expect(a.getByTestId("update-line")).toBeVisible({ timeout: 20_000 });
  await expect(b.getByTestId("update-line")).toBeVisible({ timeout: 20_000 });

  await a.getByTestId("update-line").getByRole("button", { name: "Reload" }).click();
  await expect.poll(() => isNextPage(a), { timeout: 20_000 }).toBe(1);
  // The other tab was not reloaded: same page load, still the old app, still offering the new version.
  await b.waitForTimeout(1500);
  expect(await stayed(b)).toBe("open");
  expect(await isNextPage(b)).toBe(0);
  await expect(b.getByTestId("update-line")).toBeVisible();
  // A file only the old app names, gone from the server, still loads for it.
  const status = await b.evaluate(async (u) => (await fetch(u)).status, oldChunk);
  expect(status).toBe(200);
});

// The very first tab had no worker when it registered one; Reload must still switch it to the new version.
test("Reload works in the tab that installed the first worker", async ({ page }) => {
  await page.goto(`${server.url}/`);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await mark(page);

  server.serve(next);
  await checkForUpdate(page);
  const line = page.getByTestId("update-line");
  await expect(line).toBeVisible({ timeout: 20_000 });
  expect(await stayed(page)).toBe("open");
  await line.getByRole("button", { name: "Reload" }).click();
  await expect.poll(() => isNextPage(page), { timeout: 20_000 }).toBe(1);
  await expect(page.getByTestId("update-line")).toHaveCount(0);
});
