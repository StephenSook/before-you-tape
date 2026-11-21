// Plain Playwright, not ./fixtures: nothing here needs App Check, and this runs in the CI step that has no token.
import { expect, test } from "@playwright/test";

// Local only: the built app on vite preview. After one visit online, the service worker holds the app and its
// bundled rule edition, so a reload with no network still opens the page and checks a typed item by the rules.
test("reloads offline and still checks by rules", async ({ page, context }) => {
  // USPS suspends mail to Canada from 2026-11-29: a fixed day before that keeps the verdict stable.
  await page.clock.install({ time: new Date("2026-11-20T12:00:00") });
  await page.goto("/");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  await context.setOffline(true);
  const reloaded = await page.reload();
  expect(reloaded?.fromServiceWorker(), "the offline reload is answered by the worker").toBe(true);
  await page.getByRole("button", { name: "Type an item" }).click();
  const form = page.getByTestId("add-by-hand");
  await form.getByLabel("What is it?").selectOption("lotion_cream");
  await form.getByRole("button", { name: "Add" }).click();
  await page.getByTestId("destination-picker").getByRole("radio", { name: /^Canada/ }).click();
  await expect(page.getByTestId("item-card").getByTestId("verdict-chip")).toHaveText("OK to pack");
});

// The hosting serves a route whatever its query string, so the worker does too: a shared link with tracking
// parameters still opens offline.
test("reloads a route with a query string offline", async ({ page, context }) => {
  await page.goto("/judge?utm_source=demo");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await context.setOffline(true);
  const reloaded = await page.reload();
  expect(reloaded?.fromServiceWorker()).toBe(true);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

// A photo with no network: this browser has no built-in model, so a read needs the cloud. Offline the page says so,
// asks nothing of the cloud and shows no answer from anywhere else.
test("offline, a photo check says it needs the network, and shows no answer", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  const modelRequests: string[] = [];
  page.on("request", (r) => { if (/firebasevertexai\.googleapis\.com/.test(r.url())) modelRequests.push(r.url()); });
  await page.getByTestId("upload-input").setInputFiles("tests/e2e/fixtures/lotion-label.jpg");
  await page.getByRole("button", { name: "Check this part" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "You're offline" })).toHaveText(
    "You're offline, and this laptop can't read photos on its own. Type the item, or try again when you're back online.");
  await expect(page.getByRole("button", { name: "Allow" })).toHaveCount(0);
  await expect(page.getByTestId("item-card")).toHaveCount(0);
  expect(modelRequests).toEqual([]);
});

// The service worker answers only for this site's own files: a model call or a database call is never served
// from a cache, so with no network it fails rather than replaying an old answer.
test("never answers a model or database request from a cache", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) urls.push(r.url);
    return urls;
  });
  expect(cached.length).toBeGreaterThan(0);
  for (const url of cached) expect(new URL(url).origin, url).toBe("http://localhost:4173");
  expect(cached.filter((u) => /\/eval\/|version\.json/.test(u))).toEqual([]);
  // The manifest and icons are cached too, so the installed app opens with no network.
  for (const path of ["/manifest.webmanifest", "/icons/icon-192.png", "/index.html"]) expect(cached, path).toContain(`http://localhost:4173${path}`);
  await context.setOffline(true);
  const reply = await page.evaluate(async () => {
    try { await fetch("https://firestore.googleapis.com/"); return "answered"; } catch { return "failed"; }
  });
  expect(reply).toBe("failed");
  // Pages outside the app are never served from the worker: with no network they fail, not open the app.
  await expect(page.goto("/privacy/")).rejects.toThrow(/ERR_INTERNET_DISCONNECTED/);
});

// The control: with no worker, the same offline reload fails, so the passes above are the worker's doing.
test.describe("with no service worker", () => {
  test.use({ serviceWorkers: "block" });
  test("an offline reload fails", async ({ page, context }) => {
    await page.goto("/");
    await context.setOffline(true);
    await expect(page.reload()).rejects.toThrow(/ERR_INTERNET_DISCONNECTED/);
  });
});

// The app can be installed: the page names a manifest that Chromium parses with no errors, for a standalone app,
// and the server serves each of its icons as a PNG. (Headless Chromium reports no installability errors even for a
// page with no manifest, so that call proves nothing here and is not used.)
test("the page names a web app manifest Chromium parses, with icons the server serves", async ({ page, request }) => {
  await page.goto("/");
  const cdp = await page.context().newCDPSession(page);
  const { url, errors, data } = await cdp.send("Page.getAppManifest") as { url: string; errors: unknown[]; data?: string };
  expect(url).toBe("http://localhost:4173/manifest.webmanifest");
  expect(errors).toEqual([]);
  const manifest = JSON.parse(data ?? "") as { display: string; start_url: string; icons: { src: string }[] };
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.icons.length).toBe(3);
  for (const icon of manifest.icons) {
    const r = await request.get(icon.src);
    expect(r.status(), icon.src).toBe(200);
    expect(r.headers()["content-type"], icon.src).toBe("image/png");
  }
});
