// Every control on the camera stage must be readable: its text at least 4.5:1 against its own background
// (WCAG 2.2 AA). The stage is dark with light text, so a button that inherits that light text on its
// light background disappears; it did, at 1:1. Checked before and after the camera starts; a fake camera
// stands in for a webcam. Plain Playwright: it needs no App Check token, so CI runs it.
import { expect, test, type Locator } from "@playwright/test";

test.use({
  permissions: ["camera"],
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
});

test("every control on the camera stage has readable text", async ({ page }) => {
  await page.goto("/");
  const stage = page.getByTestId("stage");
  await expect(stage.getByRole("button", { name: "Start camera" })).toBeVisible({ timeout: 20_000 });
  const before = await ratiosOf(stage);
  await stage.getByRole("button", { name: "Start camera" }).click();
  await expect(stage.getByRole("button", { name: "Check now" })).toBeVisible();
  const after = await ratiosOf(stage);

  expect(before.length, "the stage shows its controls before the camera starts").toBeGreaterThanOrEqual(2);
  expect(after.length, "and once it is on").toBeGreaterThanOrEqual(3);
  for (const r of [...before, ...after]) expect(r.ratio, r.name).toBeGreaterThanOrEqual(4.5);
});

function ratiosOf(stage: Locator) {
  return stage.evaluate((root) => {
    const rgba = (c: string): [number, number, number, number] => {
      const n = (c.match(/[\d.]+/g) ?? []).map(Number);
      return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n.length > 3 ? (n[3] ?? 1) : 1];
    };
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
    };
    const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
    // The first opaque background from the element up.
    const backOf = (el: Element | null, own?: string): number[] => {
      if (own && rgba(own)[3] > 0) return rgba(own);
      for (let e = el; e; e = e.parentElement) {
        const c = rgba(getComputedStyle(e).backgroundColor);
        if (c[3] > 0) return c;
      }
      return [255, 255, 255, 1];
    };
    const out: { name: string; ratio: number }[] = [];
    for (const b of Array.from(root.querySelectorAll("button"))) {
      if (!(b as HTMLElement).offsetParent) continue;
      out.push({ name: `button "${b.textContent?.trim()}"`, ratio: ratio(rgba(getComputedStyle(b).color), backOf(b)) });
    }
    for (const input of Array.from(root.querySelectorAll('input[type="file"]'))) {
      const pick = getComputedStyle(input, "::file-selector-button");
      out.push({ name: "photo picker button", ratio: ratio(rgba(pick.color), backOf(input, pick.backgroundColor)) });
    }
    return out;
  });
}
