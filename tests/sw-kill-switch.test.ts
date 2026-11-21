import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The service worker kill switch must stay reachable: the deploy's build reads the repository variable, and the
// build turns it into the self-removing worker (tests/e2e/sw-kill.local.spec.ts proves that worker works).
describe("service worker kill switch", () => {
  it("is read by the deploy's build from the repository variable, and by the build config", () => {
    const deploy = readFileSync(".github/workflows/deploy-live.yml", "utf8");
    const build = deploy.slice(deploy.indexOf("- name: Build with the public web config"), deploy.indexOf("- name: Build serves this commit"));
    expect(build).toContain("BYT_SW_KILL: ${{ vars.BYT_SW_KILL }}");
    expect(build).toContain("run: npm run build");
    expect(readFileSync("vite.config.ts", "utf8")).toContain('kill: process.env.BYT_SW_KILL === "1"');
  });
});
