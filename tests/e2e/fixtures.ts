import { execFileSync } from "node:child_process";
import { test as base, type BrowserContext, type Page } from "@playwright/test";

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

// The token when one is set, and none otherwise, never failing: for the one spec the deploy gate and the daily probe
// also run on the live site with no token (starts.spec.ts).
export function optionalAppCheckToken(): string | null {
  return process.env.APPCHECK_DEBUG_TOKEN_CI?.trim() || process.env.APPCHECK_DEBUG_TOKEN?.trim() || null;
}

// The only origins that get the App Check debug token: the deployed app and the local preview and dev server.
export const TOKEN_ORIGINS = ["https://before-you-tape-2026.web.app", "https://before-you-tape-2026.firebaseapp.com", "http://localhost:4173", "http://localhost:5173"];

// Puts the App Check debug token into every page of `target` (one page, or a whole browser context a test opens
// itself). The App Check SDK reads this global when it starts, so it must exist before the app loads. It is set
// only on this app's own origins: a page or frame of any other site (a probe pointed at a wrong URL, a third-party
// frame) never sees the token.
export async function giveAppCheckToken(target: Pick<Page | BrowserContext, "addInitScript">, token: string | null): Promise<void> {
  if (!token) return;
  await target.addInitScript(({ t, origins }) => {
    if (origins.includes(location.origin)) (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = t;
  }, { t: token, origins: TOKEN_ORIGINS });
}

export const test = base.extend<{ appCheckToken: string | null }>({
  appCheckToken: [
    async ({ page }, use) => {
      const token = appCheckDebugToken();
      await giveAppCheckToken(page, token);
      await use(token);
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
