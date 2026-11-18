import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, expectedSha, test } from "./fixtures";

// Audits every page at a desktop and a phone width with axe (WCAG 2.2 A and AA). Fails on any serious
// or critical violation. With BYT_EVIDENCE_DIR set, writes a summary per width there.
const WIDTHS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const;

for (const w of WIDTHS) {
  test(`home page has no serious accessibility violations at ${w.width} px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: w.width, height: w.height });
    await page.goto("/");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");

    const dir = process.env.BYT_EVIDENCE_DIR;
    if (dir) {
      mkdirSync(dir, { recursive: true });
      const summary = {
        url: `${baseURL ?? ""}/`, sha: expectedSha(), width: w.width, height: w.height, axeVersion: results.testEngine.version,
        ranAt: results.timestamp, passes: results.passes.length, incomplete: results.incomplete.length,
        violations: results.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })),
      };
      writeFileSync(join(dir, `a11y-${w.name}-${w.width}.json`), JSON.stringify(summary, null, 2) + "\n");
    }
    expect(serious.map((v) => `${v.id} (${v.impact}, ${v.nodes.length} nodes)`)).toEqual([]);
  });
}
