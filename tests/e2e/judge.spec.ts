// /judge in a real browser: the sample box shows, a country switch re-checks it, and the page makes no
// request to a Google API: no sign-in, no model call, no database. Plain Playwright, so CI runs it.
import { expect, test } from "@playwright/test";

test("the sample box works with no sign-in, camera or model", async ({ page }) => {
  const googleApis: string[] = [];
  page.on("request", (r) => { if (/googleapis\.com|firebaseio\.com|google\.com\/recaptcha/.test(r.url())) googleApis.push(new URL(r.url()).host); });
  // The sample box is judged on the page's own date, and USPS suspends mail to Canada from 2026-11-29: this
  // checks the verdicts and the country switch on a fixed day before that.
  await page.clock.setFixedTime(new Date("2026-11-20T12:00:00"));
  await page.goto("/judge");
  await expect(page.getByRole("heading", { level: 1, name: "Try the sample box" })).toBeVisible();
  const cards = page.getByTestId("sample-card");
  await expect(cards).toHaveCount(9);
  const lotion = cards.filter({ has: page.locator(".item-name", { hasText: "Body lotion" }) });
  await expect(lotion.getByTestId("verdict-chip")).toHaveText("OK to pack");
  await expect(lotion.getByRole("img")).toHaveJSProperty("complete", true);
  await page.getByTestId("destination-picker").selectOption("PH");
  await expect(lotion.getByTestId("verdict-chip")).toHaveText("Take it out");
  await expect(page.getByTestId("recheck-line")).toContainText("0 model calls");
  expect(googleApis).toEqual([]);
});

test("the heading uses the self-hosted display font, loaded from this site", async ({ page }) => {
  const fontHosts: string[] = [];
  page.on("request", (r) => { if (r.resourceType() === "font") fontHosts.push(new URL(r.url()).origin); });
  await page.goto("/judge");
  await page.evaluate(() => document.fonts.ready);
  // check() is also true when no face matches at all, so ask for a loaded face by name.
  expect(await page.evaluate(() => [...document.fonts].some((f) => f.family.replace(/"/g, "") === "Bricolage Grotesque" && f.status === "loaded"))).toBe(true);
  expect(await page.getByRole("heading", { level: 1 }).evaluate((h) => getComputedStyle(h).fontFamily)).toMatch(/^"?Bricolage Grotesque/);
  expect(new Set(fontHosts)).toEqual(new Set([new URL(page.url()).origin]));
});

// WCAG reflow: at 320 CSS px nothing scrolls sideways, even before the web fonts arrive. A native select sizes
// itself to its longest option, and the fallback font a phone or a Linux browser draws it in is wider.
test("the page fits a 320 px screen even before the web fonts load", async ({ page }) => {
  await page.route(/\.woff2$/, (r) => r.abort());
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/judge");
  await expect(page.getByTestId("destination-picker")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "no sideways page scroll").toBeLessThanOrEqual(0);
});
