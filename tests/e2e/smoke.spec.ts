import { expect, expectedSha, test } from "./fixtures";

test("the site serves this commit, built from a clean tree", async ({ request }) => {
  const res = await request.get("/version.json");
  expect(res.status()).toBe(200);
  const version = await res.json();
  expect(version.sha).toBe(expectedSha());
  expect(version.dirty).toBe(false);
});

// The title and version.json can be right while the app itself failed to start; only the started screen shows it.
test("the checker starts: no error banner, and a visitor can type an item", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Type an item" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("could not start")).toHaveCount(0);
  await expect(page.getByText("missing its settings")).toHaveCount(0);
});

test("the home page loads", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(page).toHaveTitle(/Before You Tape/);
});

// The single-page rewrite must not answer these with index.html: crawlers and agents read them as text.
for (const [path, firstLine] of [["/robots.txt", "User-agent: *"], ["/llms.txt", "# Before You Tape"]] as const) {
  test(`${path} is served as plain text, not the app page`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/^text\/plain/);
    const body = await res.text();
    expect(body.split("\n")[0]).toBe(firstLine);
    expect(body).not.toMatch(/<html/i);
  });
}
