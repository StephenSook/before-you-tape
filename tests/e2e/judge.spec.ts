// /judge in a real browser: the sample box shows, a country switch re-checks it, and the page makes no
// request to a Google API: no sign-in, no model call, no database. Plain Playwright, so CI runs it.
import { expect, test } from "@playwright/test";

test("the sample box works with no sign-in, camera or model", async ({ page }) => {
  const googleApis: string[] = [];
  page.on("request", (r) => { if (/googleapis\.com|firebaseio\.com|google\.com\/recaptcha/.test(r.url())) googleApis.push(new URL(r.url()).host); });
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
