import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, expectedSha, test } from "./fixtures";

// Audits every built page at a desktop and a phone width with axe (WCAG 2.2 A and AA). Fails on any
// serious or critical violation, and on a page with other than one main landmark. With BYT_EVIDENCE_DIR set,
// writes a summary per page and width there.
const WIDTHS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const;

const PAGES = [{ path: "/", name: "home" }, { path: "/judge", name: "judge" }, { path: "/rules", name: "rules" }, { path: "/ran", name: "ran" }, { path: "/about", name: "about" }] as const;

for (const p of PAGES) for (const w of WIDTHS) {
  test(`${p.name} page has no serious accessibility violations at ${w.width} px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: w.width, height: w.height });
    await page.goto(p.path);
    await expect(page.getByRole("heading", { level: 1 }).or(page.getByRole("button", { name: "Type an item" })).first()).toBeVisible({ timeout: 20_000 });
    expect(await page.getByRole("main").count(), "one main landmark").toBe(1);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");

    const dir = process.env.BYT_EVIDENCE_DIR;
    if (dir) {
      mkdirSync(dir, { recursive: true });
      const summary = {
        url: `${baseURL ?? ""}${p.path}`, sha: expectedSha(), width: w.width, height: w.height, axeVersion: results.testEngine.version,
        ranAt: results.timestamp, passes: results.passes.length, incomplete: results.incomplete.length,
        violations: results.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })),
      };
      writeFileSync(join(dir, `a11y-${p.name}-${w.name}-${w.width}.json`), JSON.stringify(summary, null, 2) + "\n");
    }
    expect(serious.map((v) => `${v.id} (${v.impact}, ${v.nodes.length} nodes)`)).toEqual([]);
  });
}
