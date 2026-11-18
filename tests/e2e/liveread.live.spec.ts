// The daily positive live read: one real photo, one real model call through Firebase AI Logic, on the
// deployed site. A browser in CI has no built-in model, so the read goes to the cloud. The CI App Check debug
// token comes from the fixtures; with no token in CI they fail closed. Each run leaves one box with this item.
import { expect, test } from "./fixtures";

test("a real label photo is read in the cloud and judged OK to pack for Canada", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Allow" }).click();
  await page.getByTestId("upload-input").setInputFiles("tests/e2e/fixtures/lotion-label.jpg");
  const send = page.getByRole("button", { name: "Check this part" });
  await expect(send).toBeEnabled({ timeout: 20_000 });
  await send.click();
  const card = page.getByTestId("item-card");
  await expect(card.getByTestId("verdict-chip")).toHaveText("OK to pack", { timeout: 60_000 });
  await expect(card.getByTestId("source-glyph")).toHaveAccessibleName("Read in the cloud");
});
