// One real read on the live site, through the app's own cloud path: a browser with no on-device model allows
// cloud checks, adds the test label image, presses "Check this part", and the model's reply must come back as
// a read the app can use, shown as read in the cloud. It makes one model call. A paused API, an App Check
// refusal, a quota error or a reply that is not a read all fail it. It needs the App Check debug token (from
// the fixtures, which put it only into this app's pages); without one it fails rather than skipping, so the
// daily probe can never read green without a real read. It does not check the verdict, which depends on how
// fresh the rules are on the day. Each run leaves one box with this item.
import { readFromReply } from "../../scripts/live-read-reply";
import { expect, test } from "./fixtures";

test("a real cloud read on the live site comes back as a read", async ({ page, appCheckToken }) => {
  test.setTimeout(90_000);
  expect(appCheckToken, "no App Check debug token: APPCHECK_DEBUG_TOKEN_CI in CI, or APPCHECK_DEBUG_TOKEN locally").toBeTruthy();
  const replies: Array<{ status: number; body: unknown }> = [];
  // Status codes only, for the failure message: the App Check debug-token exchanges and the model calls.
  const exchanges: number[] = [];
  page.on("response", async (r) => {
    if (r.url().includes(":exchangeDebugToken")) exchanges.push(r.status());
    if (!r.url().includes(":generateContent")) return;
    replies.push({ status: r.status(), body: await r.json().catch(() => null) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Allow" }).click();
  await page.getByTestId("upload-input").setInputFiles("tests/e2e/fixtures/lotion-label.jpg");
  const send = page.getByRole("button", { name: "Check this part" });
  await expect(send).toBeEnabled({ timeout: 20_000 });
  await send.click();
  const card = page.getByTestId("item-card");
  try {
    await expect(card.getByTestId("verdict-chip")).toBeVisible({ timeout: 60_000 });
  } catch (e) {
    const shown = (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 600);
    throw new Error(`no read came back. App Check debug exchanges: ${JSON.stringify(exchanges)}; model calls: ${JSON.stringify(replies.map((r) => r.status))}; the page shows: ${shown}`, { cause: e });
  }
  await expect(card.getByTestId("source-glyph")).toHaveAccessibleName("Read in the cloud");
  await expect.poll(() => replies.length, { timeout: 10_000 }).toBeGreaterThan(0);
  const first = replies[0]!;
  expect(first.status, `the model call answered ${first.status}`).toBe(200);
  const read = readFromReply(first.body);
  console.log(`live read: HTTP 200, category ${read.category}, ${replies.length} model call(s)`);
});
