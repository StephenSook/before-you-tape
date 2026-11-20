// Hosting sends only the app's own routes to the app. Any other path, including a data file that is
// missing, gets a real 404 status and public/404.html, never the app shell with a 200.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { routePaths } from "./routes";

interface Rewrite { source?: string; regex?: string; destination?: string }
const root = join(__dirname, "..");
const hosting = (JSON.parse(readFileSync(join(root, "firebase.json"), "utf8")) as { hosting: { rewrites: Rewrite[] } }).hosting;

// A route as an anchored hosting regex. The router matches routes in any letter case, so each letter of a fixed
// segment matches either case; a parameter such as ":token" is one segment, kept exactly; one trailing slash is
// allowed. Written with character classes, so it reads the same in Hosting's RE2 and in this test.
const regexFor = (path: string) => path === "/" ? "^/$"
  : `^${path.split("/").slice(1).map((seg) => `/${seg.startsWith(":") ? "[^/]+" : [...seg].map((c) => (/[a-z]/.test(c) ? `[${c}${c.toUpperCase()}]` : c)).join("")}`).join("")}/?$`;

describe("hosting", () => {
  it("rewrites exactly the app's public routes to the app shell, and nothing else", () => {
    expect(hosting.rewrites.map((r) => r.regex)).toEqual(routePaths(false).map(regexFor));
    expect(hosting.rewrites.every((r) => r.destination === "/index.html" && r.source === undefined)).toBe(true);
  });

  it("serves every route spelling the app accepts, keeps a token exact, and sends anything else to the 404 page", () => {
    const served = (path: string) => hosting.rewrites.some((r) => new RegExp(r.regex!).test(path));
    for (const path of ["/", "/judge", "/Judge", "/JUDGE", "/judge/", "/rules", "/RULES", "/Rules/", "/ran", "/about",
      "/blind/AbC123xyz", "/Blind/AbC123xyz", "/BLIND/abc/"]) {
      expect(served(path), path).toBe(true);
    }
    for (const path of ["/judge/child", "/judgex", "/blind", "/blind/", "/blind/a/b", "/no-such-page", "/eval/sets/missing.json", "/measured", "/worksheet",
      "/assets/missing.js", "/desk/eval", "/sw.js", "//judge"]) {
      expect(served(path), path).toBe(false);
    }
  });

  it("ships a not-found page that links home and to the sample box", () => {
    const html = readFileSync(join(root, "public", "404.html"), "utf8");
    expect(html).toMatch(/<title>Page not found[^<]*<\/title>/);
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/judge"');
  });
});
