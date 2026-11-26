// Whether the app started, as a visitor sees it. The deploy gate and the daily probe also run it on the live site,
// where no token is set, so it takes the App Check debug token only when one is: the local build has the live
// project's settings, and without a token its reads reach the live database as refused requests.
import { expect, test } from "@playwright/test";
import { giveAppCheckToken, optionalAppCheckToken } from "./fixtures";

test.beforeEach(async ({ page }) => { await giveAppCheckToken(page, optionalAppCheckToken()); });

// The title and version.json can be right while the app itself failed to start; only the started screen shows it.
test("the checker starts: no error banner, and a visitor can type an item", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Type an item" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("could not start")).toHaveCount(0);
  await expect(page.getByText("missing its settings")).toHaveCount(0);
});

// /judge is where the write-up sends judges: it needs no sign-in, camera or model, so it must show its sample box,
// nine items by name, each with one of the three verdicts. Which verdict depends on the visitor's date (a stale rule
// layer turns "OK to pack" into "Check this"), so only that each card has one is checked here.
const SAMPLE_NAMES = ["Body lotion", "Whole-bean coffee", "T-shirt", "Power bank", "Perfume", "Smartphone", "Hand sanitizer",
  "Dark chocolate bar", "Ceramic mug"];
test("the judge page loads its sample box: nine items, each with a verdict", async ({ page }) => {
  await page.goto("/judge");
  await expect(page.getByRole("heading", { level: 1, name: "Try the sample box" })).toBeVisible({ timeout: 20_000 });
  const cards = page.getByTestId("sample-card");
  await expect(cards).toHaveCount(SAMPLE_NAMES.length);
  for (const name of SAMPLE_NAMES) await expect(cards.getByText(name, { exact: true }), name).toHaveCount(1);
  for (let i = 0; i < SAMPLE_NAMES.length; i++) {
    await expect(cards.nth(i).getByTestId("verdict-chip")).toHaveText(/^(OK to pack|Check this|Take it out)$/);
  }
  await expect(page.getByText("could not start")).toHaveCount(0);
});


// The heading lines up with the text under it, at a desktop and a phone width.
for (const width of [1280, 390]) {
  test(`the page heading sits in the same gutter as the text under it at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Type an item" })).toBeVisible({ timeout: 20_000 });
    const h1 = await page.getByRole("heading", { level: 1 }).boundingBox();
    const purpose = await page.getByTestId("purpose").boundingBox();
    expect(h1 && purpose && Math.abs(h1.x - purpose.x)).toBeLessThanOrEqual(1);
  });
}
