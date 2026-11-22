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
