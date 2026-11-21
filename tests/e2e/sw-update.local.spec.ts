import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startBuildServer, type BuildServer } from "./swServer";

// A deploy reaching a browser that already has the worker. "Old" is the shipped build; "new" is the same build with
// a changed page, its worker's entry for it and its version.json, as the next deploy would change them. The open
// page keeps the old app until the visitor presses Reload, and version.json always comes from the network.
const NEW_SHA = "b".repeat(40);
let fresh = "";
let server: BuildServer;

test.beforeAll(() => {
  fresh = mkdtempSync(join(tmpdir(), "byt-sw-new-"));
  cpSync("dist", fresh, { recursive: true });
  const sw = readFileSync(join(fresh, "sw.js"), "utf8");
  const entry = /\{url:"index\.html",revision:"[^"]+"\}/g;
  expect(sw.match(entry), "the worker lists the page once").toHaveLength(1);
  writeFileSync(join(fresh, "sw.js"), sw.replace(entry, '{url:"index.html",revision:"byt-test-new"}'));
  const page = readFileSync(join(fresh, "index.html"), "utf8");
  expect(page).toContain("<head>");
  writeFileSync(join(fresh, "index.html"), page.replace("<head>", '<head><meta name="byt-test-build" content="new">'));
  writeFileSync(join(fresh, "version.json"), `${JSON.stringify({ sha: NEW_SHA, dirty: false, builtAt: "2026-11-21T00:00:00Z" })}\n`);
});
test.beforeEach(async () => { server = await startBuildServer("dist"); });
test.afterEach(async () => { await server.close(); });
test.setTimeout(60_000);

const servedSha = (page: Page) => page.evaluate(async () => ((await (await fetch("/version.json", { cache: "no-store" })).json()) as { sha: string }).sha);
const isNewPage = (page: Page) => page.locator('meta[name="byt-test-build"]').count();

test("a new deploy waits for Reload, then serves the new page and version", async ({ page }) => {
  await page.goto(`${server.url}/`);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  const oldSha = await servedSha(page);
  expect(oldSha).toMatch(/^[0-9a-f]{40}$|^unknown$/);

  server.serve(fresh);
  await page.reload();
  await page.evaluate(() => { (window as unknown as { bytStay: string }).bytStay = "open"; });
  const line = page.getByTestId("update-line");
  await expect(line).toHaveText("A new version is ready. Reload", { timeout: 20_000 });
  // Nothing reloaded the page by itself: it is still the old app, and the same page load.
  expect(await isNewPage(page)).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { bytStay?: string }).bytStay)).toBe("open");
  // version.json is never served from the worker, so a version check sees the new deploy at once.
  expect(await servedSha(page)).toBe(NEW_SHA);

  await line.getByRole("button", { name: "Reload" }).click();
  await expect.poll(() => isNewPage(page), { timeout: 20_000 }).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { bytStay?: string }).bytStay)).toBeUndefined();
  await expect(page.getByTestId("update-line")).toHaveCount(0);
  expect(await servedSha(page)).toBe(NEW_SHA);
});
