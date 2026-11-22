import { defineConfig, devices } from "@playwright/test";
import { localLiveOptIn } from "./scripts/e2e-live-opt-in";

// Two projects: "local" runs against `vite preview` of the current build, "live" against the
// deployed site. BYT_LIVE=1 skips starting the preview server for live runs.
const live = process.env.BYT_LIVE === "1";
// The local build has the live project's settings, so a local run starts only with an explicit opt-in and a
// registered App Check debug token (scripts/e2e-live-opt-in.ts). Every CI step that runs it sets both.
if (!live) localLiveOptIn(process.env);

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "list" : "line",
  projects: [
    // *.live.spec.ts write to the live project's database, so they never run against a local build.
    { name: "local", testIgnore: /\.live\.spec\.ts$/, use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4173" } },
    // *.local.spec.ts stub the model endpoint, so they never run against the live site.
    // BYT_LIVE_URL lets the daily probe point the live checks elsewhere, so a wrong URL proves they fail.
    { name: "live", testIgnore: /\.local\.spec\.ts$/, use: { ...devices["Desktop Chrome"], baseURL: process.env.BYT_LIVE_URL?.trim() || "https://before-you-tape-2026.web.app" } },
  ],
  ...(live ? {} : {
    // Never reuse a server already on 4173: another project on this machine once had its preview there, and the
    // checks tested that app instead of this one. 4173 itself is fixed, because the browser key allows only it.
    webServer: { command: "npm run preview -- --port 4173 --strictPort", url: "http://localhost:4173", reuseExistingServer: false },
  }),
});
