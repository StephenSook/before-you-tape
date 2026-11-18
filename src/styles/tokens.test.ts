import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Spec 5.13: the palette and its measured contrast pairs. A token change that breaks a pair fails here.
const css = readFileSync(join(__dirname, "tokens.css"), "utf8");

function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
  if (!m?.[1]) throw new Error(`tokens.css has no --${name} hex value`);
  return m[1];
}

// WCAG 2 relative luminance and contrast ratio.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe("tokens.css", () => {
  it("holds the spec palette", () => {
    expect({ paper: token("paper"), ink: token("ink"), kraft: token("kraft"), night: token("night"), holly: token("holly"), berry: token("berry"), amber: token("amber") })
      .toEqual({ paper: "#fff3e6", ink: "#1d1712", kraft: "#c98d4f", night: "#262465", holly: "#17784a", berry: "#c4203a", amber: "#f4c542" });
  });

  it("matches the measured contrast pairs", () => {
    for (const [fg, bg, measured] of [["paper", "holly", 5.03], ["paper", "berry", 5.32], ["ink", "amber", 10.91], ["ink", "paper", 16.24], ["paper", "night", 12.62], ["ink", "kraft", 6.26]] as const) {
      expect(contrast(token(fg), token(bg)), `${fg} on ${bg}`).toBeCloseTo(measured, 1);
    }
  });

  it("keeps every verdict chip at 4.5 to 1 or better", () => {
    expect(contrast(token("paper"), token("holly"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("paper"), token("berry"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("ink"), token("amber"))).toBeGreaterThanOrEqual(4.5);
  });
});
