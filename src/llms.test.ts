import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { builtPagePaths } from "./routes";

// llms.txt tells machines what the site offers. It may list only pages that are built, never a title stub.
describe("llms.txt", () => {
  it("lists only built pages of this site", () => {
    const text = readFileSync("public/llms.txt", "utf8");
    const links = [...text.matchAll(/\]\((https:\/\/before-you-tape-2026\.web\.app[^)]*)\)/g)].map((m) => new URL(m[1]!).pathname);
    expect(links.length).toBeGreaterThan(0);
    for (const path of links) expect(builtPagePaths(), path).toContain(path);
  });
});
