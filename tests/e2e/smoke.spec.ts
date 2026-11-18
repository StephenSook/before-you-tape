import { expect, expectedSha, test } from "./fixtures";

test("the site serves this commit, built from a clean tree", async ({ request }) => {
  const res = await request.get("/version.json");
  expect(res.status()).toBe(200);
  const version = await res.json();
  expect(version.sha).toBe(expectedSha());
  expect(version.dirty).toBe(false);
});

test("the home page loads", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(page).toHaveTitle(/Before You Tape/);
});
