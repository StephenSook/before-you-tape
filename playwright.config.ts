import { defineConfig, devices } from "@playwright/test";

// Two projects: "local" runs against `vite preview` of the current build, "live" against the
// deployed site. BYT_LIVE=1 skips starting the preview server for live runs.
const live = process.env.BYT_LIVE === "1";

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "list" : "line",
  projects: [
    { name: "local", use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4173" } },
    { name: "live", use: { ...devices["Desktop Chrome"], baseURL: "https://before-you-tape-2026.web.app" } },
  ],
  ...(live ? {} : {
    webServer: { command: "npm run preview -- --port 4173 --strictPort", url: "http://localhost:4173", reuseExistingServer: !process.env.CI },
  }),
});
