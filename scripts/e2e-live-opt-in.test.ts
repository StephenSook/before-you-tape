import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { localLiveOptIn } from "./e2e-live-opt-in";

const NAMES = /BYT_E2E_LIVE_PROJECT=1[\s\S]*APPCHECK_DEBUG_TOKEN_CI/;

describe("localLiveOptIn", () => {
  it("refuses a local run with no opt-in, naming both settings", () => {
    expect(() => localLiveOptIn({})).toThrow(NAMES);
    expect(() => localLiveOptIn({ APPCHECK_DEBUG_TOKEN_CI: "t" })).toThrow(NAMES);
  });

  it("refuses an opt-in without a debug token", () => {
    expect(() => localLiveOptIn({ BYT_E2E_LIVE_PROJECT: "1" })).toThrow(NAMES);
    expect(() => localLiveOptIn({ BYT_E2E_LIVE_PROJECT: "1", APPCHECK_DEBUG_TOKEN_CI: "  " })).toThrow(NAMES);
    expect(() => localLiveOptIn({ BYT_E2E_LIVE_PROJECT: "true", APPCHECK_DEBUG_TOKEN_CI: "t" })).toThrow(NAMES);
  });

  it("lets CI run with the opt-in and the CI token, and only that token", () => {
    expect(() => localLiveOptIn({ CI: "true", BYT_E2E_LIVE_PROJECT: "1", APPCHECK_DEBUG_TOKEN_CI: "t" })).not.toThrow();
    expect(() => localLiveOptIn({ CI: "true", BYT_E2E_LIVE_PROJECT: "1", APPCHECK_DEBUG_TOKEN: "t" })).toThrow(NAMES);
  });

  it("lets a developer run with the opt-in and their own registered token", () => {
    expect(() => localLiveOptIn({ BYT_E2E_LIVE_PROJECT: "1", APPCHECK_DEBUG_TOKEN: "t" })).not.toThrow();
  });
});

// Every workflow step that runs the local project must opt in and carry the CI token from the secret, or the
// guard stops it (and a step that slipped past it would reach the live database with no App Check token).
const steps = (workflow: string) => {
  const text = readFileSync(`.github/workflows/${workflow}`, "utf8");
  return text.split(/\n(?= {6}- name:)/).filter((s) => /npx playwright test --project=local /.test(s));
};

describe("workflow steps that run the local browser project", () => {
  it("each opt in with the CI token from the secret", () => {
    const all = [...steps("ci.yml"), ...steps("deploy-live.yml")];
    expect(all.length).toBeGreaterThanOrEqual(3);
    for (const s of all) {
      expect(s, s.split("\n")[0]).toContain('BYT_E2E_LIVE_PROJECT: "1"');
      expect(s, s.split("\n")[0]).toContain("APPCHECK_DEBUG_TOKEN_CI: ${{ secrets.APPCHECK_DEBUG_TOKEN_CI }}");
    }
  });

  it("and the guard lets that env through", () => {
    expect(() => localLiveOptIn({ CI: "true", BYT_E2E_LIVE_PROJECT: "1", APPCHECK_DEBUG_TOKEN_CI: "from-the-secret" })).not.toThrow();
  });

  it("the Playwright config calls the guard before it starts the local build", () => {
    const config = readFileSync("playwright.config.ts", "utf8");
    expect(config).toMatch(/import \{ localLiveOptIn \} from "\.\/scripts\/e2e-live-opt-in"/);
    expect(config).toMatch(/if \(!live\) localLiveOptIn\(process\.env\);/);
  });
});
