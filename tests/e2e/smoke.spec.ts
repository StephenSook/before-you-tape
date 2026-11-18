import { expect, expectedSha, test } from "./fixtures";

test("the site serves this commit", async ({ request }) => {
  const res = await request.get("/version.json");
  expect(res.status()).toBe(200);
  expect((await res.json()).sha).toBe(expectedSha());
});

test("the home page loads", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(page).toHaveTitle(/Before You Tape/);
});
