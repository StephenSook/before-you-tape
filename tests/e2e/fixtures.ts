import { execFileSync } from "node:child_process";
import { test as base } from "@playwright/test";

// The commit the site under test should serve: the workflow's SHA in CI, this checkout's HEAD locally.
export function expectedSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  if (process.env.CI) throw new Error("GITHUB_SHA is not set in CI");
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

// App Check debug token for the browser under test. Under CI a missing token throws: a test that
// needs App Check must never skip. Locally it is optional and comes from APPCHECK_DEBUG_TOKEN.
export function appCheckDebugToken(): string | null {
  const ci = process.env.APPCHECK_DEBUG_TOKEN_CI?.trim();
  if (process.env.CI) {
    if (!ci) throw new Error("APPCHECK_DEBUG_TOKEN_CI is not set in CI");
    return ci;
  }
  return process.env.APPCHECK_DEBUG_TOKEN?.trim() || null;
}

export const test = base.extend<{ appCheckToken: string | null }>({
  appCheckToken: [
    async ({ page }, use) => {
      const token = appCheckDebugToken();
      // The App Check SDK reads this global when it starts, so it must exist before the app loads.
      if (token) await page.addInitScript((t) => { (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = t; }, token);
      await use(token);
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
