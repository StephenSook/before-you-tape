import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface FontFile { family: string; file: string; weight: number; license: string; source: string }
const manifest = JSON.parse(readFileSync("public/fonts/manifest.json", "utf8")) as FontFile[];
const tokens = readFileSync("src/styles/tokens.css", "utf8");

describe("self-hosted fonts", () => {
  it("self-hosts four OFL families, each with its license file", () => {
    expect([...new Set(manifest.map((f) => f.family))].sort()).toEqual(["Bricolage Grotesque", "Caveat", "DM Mono", "Figtree"]);
    for (const f of manifest) {
      expect(existsSync(`public/fonts/${f.file}`), f.file).toBe(true);
      expect(f.license).toBe("OFL-1.1");
      expect(f.source).toMatch(/^https:\/\//);
    }
    for (const n of ["BricolageGrotesque", "Figtree", "DMMono", "Caveat"]) {
      expect(readFileSync(`public/fonts/licenses/OFL-${n}.txt`, "utf8")).toMatch(/SIL OPEN FONT LICENSE/i);
    }
  });

  it("loads no font from another host", () => {
    const css = tokens + readFileSync("src/styles/app.css", "utf8");
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic|https?:\/\//);
  });

  it("declares each listed file once in the font faces, and nothing else", () => {
    const urls = [...tokens.matchAll(/url\("\/fonts\/([^"]+)"\)/g)].map((m) => m[1]).sort();
    expect(urls).toEqual(manifest.map((f) => f.file).sort());
  });

  it("uses the families for display, body and mono text", () => {
    expect(tokens).toMatch(/--font-display: "Bricolage Grotesque"/);
    expect(tokens).toMatch(/--font-body: "Figtree"/);
    expect(tokens).toMatch(/--font-mono: "DM Mono"/);
    expect(tokens).toMatch(/--font-hand: "Caveat"/);
  });
});
