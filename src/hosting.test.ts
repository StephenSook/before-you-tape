// Hosting sends only the app's own routes to the app. Any other path, including a data file that is
// missing, gets a real 404 status and public/404.html, never the app shell with a 200.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { routePaths } from "./routes";

interface Rewrite { source?: string; regex?: string; destination?: string }
interface HeaderRule { source?: string; regex?: string; headers: { key: string; value: string }[] }
const root = join(__dirname, "..");
const hosting = (JSON.parse(readFileSync(join(root, "firebase.json"), "utf8")) as { hosting: { rewrites: Rewrite[]; headers?: HeaderRule[] } }).hosting;
const NO_CACHE = "no-cache";
const IMMUTABLE = "public, max-age=31536000, immutable";
// The rules whose pattern matches a request path: a regex, an exact path, or the one "/assets/**" glob.
const rulesFor = (path: string) => (hosting.headers ?? []).filter((r) =>
  r.regex !== undefined ? new RegExp(r.regex).test(path) : r.source === "/assets/**" ? path.startsWith("/assets/") : r.source === path);
const cacheOf = (r: HeaderRule) => r.headers.find((h) => h.key === "Cache-Control")?.value;

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

  // A visitor who opened the site before a deploy gets the new app at once: pages, version.json, robots.txt and
  // llms.txt are checked again every time, and the hashed bundles, whose names change with their content, are kept.
  it("never lets a browser keep an old page, and keeps the hashed bundles", () => {
    for (const path of ["/", "/judge", "/Judge/", "/rules", "/ran", "/about", "/blind/AbC123xyz", "/index.html", "/404.html",
      "/version.json", "/robots.txt", "/llms.txt"]) {
      expect(rulesFor(path).map(cacheOf), path).toEqual([NO_CACHE]);
    }
    for (const path of ["/assets/index-u_ZA3lqW.js", "/assets/index-AbC.css"]) {
      expect(rulesFor(path).map(cacheOf), path).toEqual([IMMUTABLE]);
    }
    // Every rewritten route has its no-cache rule, by the same pattern, so a new route cannot miss one.
    for (const r of hosting.rewrites) {
      expect((hosting.headers ?? []).some((h) => h.regex === r.regex && cacheOf(h) === NO_CACHE), r.regex).toBe(true);
    }
    // The service worker is checked again every time too, so a browser learns of a new version on its next visit
    // instead of keeping an old worker, and the old app it caches, for up to an hour.
    for (const path of ["/sw.js"]) expect(rulesFor(path).map(cacheOf), path).toEqual([NO_CACHE]);
  });

  it("ships an icon that every page names, so no browser asks for a missing favicon.ico", () => {
    const icon = readFileSync(join(root, "public", "favicon.svg"), "utf8");
    expect(icon.startsWith("<svg")).toBe(true);
    for (const page of ["index.html", "public/404.html"]) {
      expect(readFileSync(join(root, page), "utf8"), page).toMatch(/<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml"/);
    }
  });
});

