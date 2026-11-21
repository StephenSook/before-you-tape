import { expect, test } from "./fixtures";

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
