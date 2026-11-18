// Whether the app started, as a visitor sees it. It needs no App Check token, so it uses the plain
// Playwright test rather than the fixtures that inject one: the deploy gate and the daily probe run it in
// CI, where no token is set.
import { expect, test } from "@playwright/test";

// The title and version.json can be right while the app itself failed to start; only the started screen shows it.
test("the checker starts: no error banner, and a visitor can type an item", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Type an item" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("could not start")).toHaveCount(0);
  await expect(page.getByText("missing its settings")).toHaveCount(0);
});

