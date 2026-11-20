// One real read on the live site, through the app's own cloud path: a browser with no on-device model allows
// cloud checks, adds the test label image, and the model's reply must come back as a read the app can use.
// It makes one model call. A paused API, an App Check refusal, a quota error or a reply that is not a read
// all fail it. It needs the CI App Check debug token; without one it fails rather than skipping, so a probe
// with no token can never read green.
import { expect, test } from "@playwright/test";
import { readFromReply } from "../../scripts/live-read-reply";

test("a real cloud read on the live site comes back as a read", async ({ browser }) => {
  const token = process.env.APPCHECK_DEBUG_TOKEN?.trim() ?? "";
  expect(token, "APPCHECK_DEBUG_TOKEN is not set: the live read needs the CI App Check debug token").not.toBe("");
  const context = await browser.newContext();
  await context.addInitScript((t) => { (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = t; }, token);
  const page = await context.newPage();
  const replies: Array<{ status: number; body: unknown }> = [];
  page.on("response", async (r) => {
    if (!r.url().includes(":generateContent")) return;
    replies.push({ status: r.status(), body: await r.json().catch(() => null) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Allow" }).click();
  await page.getByTestId("upload-input").setInputFiles("tests/e2e/fixtures/lotion-label.jpg");
  await expect(page.getByTestId("verdict-chip").first()).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => replies.length, { timeout: 10_000 }).toBeGreaterThan(0);
  const first = replies[0]!;
  expect(first.status, `the model call answered ${first.status}`).toBe(200);
  const read = readFromReply(first.body);
  console.log(`live read: HTTP 200, category ${read.category}, ${replies.length} model call(s)`);
  await context.close();
});
