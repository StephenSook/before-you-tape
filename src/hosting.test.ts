// Hosting sends only the app's own routes to the app. Any other path, including a data file that is
// missing, gets a real 404 status and public/404.html, never the app shell with a 200.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { routePaths } from "./routes";

interface Rewrite { source?: string; regex?: string; destination?: string }
const root = join(__dirname, "..");
const hosting = (JSON.parse(readFileSync(join(root, "firebase.json"), "utf8")) as { hosting: { rewrites: Rewrite[] } }).hosting;

// A route parameter such as ":token" is one path segment, which is "*" in a hosting glob.
const glob = (path: string) => path.replace(/:[^/]+/g, "*");

describe("hosting", () => {
  it("rewrites exactly the app's public routes to the app shell, and nothing else", () => {
    expect(hosting.rewrites.map((r) => r.source)).toEqual(routePaths(false).map(glob));
    expect(hosting.rewrites.every((r) => r.destination === "/index.html" && r.regex === undefined)).toBe(true);
  });

  it("ships a not-found page that links home and to the sample box", () => {
    const html = readFileSync(join(root, "public", "404.html"), "utf8");
    expect(html).toMatch(/<title>Page not found[^<]*<\/title>/);
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/judge"');
  });
});
