// The App Check debug token goes only into pages of this app. A probe pointed at a wrong URL, or a link to
// another site, must never hand the token to that site's own scripts.
import { expect, test } from "./fixtures";

test("the debug token reaches this app's pages and no other site", async ({ page, appCheckToken }) => {
  test.skip(!appCheckToken, "needs a debug token");
  const tokenIn = () => page.evaluate(() => typeof (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN);
  await page.route("https://another-site.example/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>another site</p>" }));
  await page.goto("https://another-site.example/");
  expect(await tokenIn()).toBe("undefined");
  await page.goto("/");
  expect(await tokenIn()).toBe("string");
});
