import { expect, test } from "./fixtures";

// A browser with no on-device model, and cloud checks not allowed: a photo must reach no model anywhere. The SDK's
// on-device-only mode was seen sending a read to the cloud when the browser had no model API, so this checks every
// request the page makes, to any host, not only the AI Logic one.
const MODEL_CALL = /firebasevertexai\.googleapis\.com|generativelanguage\.googleapis\.com|aiplatform\.googleapis\.com|generateContent|on-device-only\.invalid/;

test("with no on-device model and the cloud declined, a photo sends nothing to any model", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-20T12:00:00") });
  await page.addInitScript(() => {
    delete (window as unknown as { LanguageModel?: unknown }).LanguageModel;
    Object.defineProperty(window, "LanguageModel", { value: undefined, configurable: true });
  });
  const modelRequests: string[] = [];
  page.on("request", (r) => { if (MODEL_CALL.test(r.url())) modelRequests.push(`${r.method()} ${new URL(r.url()).host}`); });
  // The page's message is for the situation it was written in, and Remote Config's settings change that situation
  // when they arrive: the photo waits for them (or for their fetch to fail, without App Check), so its message stays.
  const settings = page.waitForResponse((r) => r.url().includes("firebaseremoteconfig.googleapis.com") && r.url().includes(":fetch"), { timeout: 15_000 }).catch(() => null);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Type an item" })).toBeVisible();
  await settings;
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => (window as unknown as { LanguageModel?: unknown }).LanguageModel)).toBeUndefined();
  // The sender keeps everything on this laptop first, through the cloud chip.
  await page.getByRole("button", { name: "Cloud: off" }).click();
  await page.getByRole("button", { name: "Check on this laptop only" }).click();
  await page.getByTestId("upload-input").setInputFiles("tests/e2e/fixtures/lotion-label.jpg");
  const send = page.getByRole("button", { name: "Check this part" });
  await expect(send).toBeEnabled();
  await send.click();
  // Give any late request time to show.
  await page.waitForTimeout(3000);
  expect(modelRequests).toEqual([]);
  // The page says it cannot read the photo here and offers typing (its wording depends on whether settings loaded).
  await expect(page.getByRole("alert").filter({ hasText: /can't read photos on its own/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("item-card")).toHaveCount(0);
});
