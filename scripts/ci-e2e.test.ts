import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The CI workflow names its browser check files one by one, so a new spec runs in CI only once it is added
// there. A spec left out passes every pull request without ever running.
const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const localRuns = workflow.split("\n").filter((l) => /npx playwright test --project=local /.test(l));
const listed = new Set(localRuns.flatMap((l) => l.match(/tests\/e2e\/[\w.-]+\.spec\.ts/g) ?? []));
const specs = readdirSync("tests/e2e").filter((f) => f.endsWith(".spec.ts") && !f.endsWith(".live.spec.ts")).map((f) => `tests/e2e/${f}`);

describe("CI browser checks", () => {
  it("run every local browser spec", () => {
    expect(localRuns.length).toBeGreaterThan(0);
    expect(specs.length).toBeGreaterThan(5);
    expect(specs.filter((s) => !listed.has(s))).toEqual([]);
  });

  it("name only specs that exist", () => {
    expect([...listed].filter((s) => !specs.includes(s))).toEqual([]);
  });
});
