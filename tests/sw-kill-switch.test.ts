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

  // Rolling a kill deploy back would put the previous release's normal worker back on the site while the switch is
  // still on, so a kill deploy whose checks fail stays live, and the run says so.
  it("never rolls a kill deploy back to a release with a normal worker", () => {
    const deploy = readFileSync(".github/workflows/deploy-live.yml", "utf8");
    const step = (name: string) => {
      const at = deploy.indexOf(`- name: ${name}`);
      expect(at, name).toBeGreaterThan(0);
      const next = deploy.indexOf("\n      - ", at + 1);
      return deploy.slice(at, next < 0 ? undefined : next);
    };
    const ifOf = (block: string) => /\n\s+if: (.+)/.exec(block)?.[1] ?? "";
    expect(ifOf(step("Roll back to the release that was live before"))).toContain("vars.BYT_SW_KILL != '1'");
    const held = step("Keep a failed kill deploy live");
    expect(ifOf(held)).toContain("failure()");
    expect(ifOf(held)).toContain("vars.BYT_SW_KILL == '1'");
    expect(held).toContain("::warning::");
  });
});

