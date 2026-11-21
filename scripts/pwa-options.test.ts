import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appRoutes, pwaOptions, sha256Revisions } from "./pwa-options";

const firebase = JSON.parse(readFileSync("firebase.json", "utf8")) as { hosting: { rewrites: { regex?: string; source?: string; destination: string }[] } };
const routes = appRoutes(firebase.hosting.rewrites);

describe("appRoutes", () => {
  it("is every route the hosting rewrites to the app, and nothing else", () => {
    expect(routes.map(String)).toEqual(firebase.hosting.rewrites.filter((r) => r.destination === "/index.html").map((r) => String(new RegExp(r.regex!))));
    for (const path of ["/", "/judge", "/rules/", "/ran", "/about", "/blind/set-1"]) expect(routes.some((re) => re.test(path)), path).toBe(true);
    for (const path of ["/privacy/", "/support/", "/extension-privacy.html", "/ext-bridge.html", "/eval/sets/x.json", "/version.json"]) {
      expect(routes.some((re) => re.test(path)), path).toBe(false);
    }
  });

  it("refuses a rewrite it cannot turn into a route, rather than drop it", () => {
    expect(() => appRoutes([{ source: "/x", destination: "/index.html" }])).toThrow();
  });
});

describe("pwaOptions", () => {
  const o = pwaOptions({ kill: false });

  it("builds the worker written in src/pwa/sw.ts, with only the app's own shell to cache", () => {
    expect(o.strategies).toBe("injectManifest");
    expect([o.srcDir, o.filename]).toEqual(["src/pwa", "sw.ts"]);
    expect(o.injectManifest?.globPatterns).toEqual(["index.html", "assets/*.{js,css}", "fonts/**/*.woff2", "favicon.svg", "icons/*.png", "manifest.webmanifest"]);
    // The plugin adds no files of its own, so every listed file goes through the SHA-256 step.
    expect([o.manifest, o.includeManifestIcons]).toEqual([false, false]);
    expect(o.injectManifest?.globIgnores).toEqual(["assets/extBridge-*"]);
    expect(o.injectManifest?.rollupFormat).toBe("iife");
  });

  // The page registers the worker itself (src/pwa/register.ts), so the plugin's own reload-on-update never runs.
  it("injects no registration of its own", () => {
    expect(o.injectRegister).toBe(false);
  });

  it("builds the same worker with no files to cache when the kill switch is on", () => {
    const kill = pwaOptions({ kill: true });
    expect([kill.strategies, kill.srcDir, kill.filename]).toEqual(["injectManifest", "src/pwa", "sw.ts"]);
    expect(kill.injectManifest?.globPatterns).toEqual([]);
  });

  // The app can be installed: a committed manifest the page links, with the page's own description and icons drawn
  // from the favicon. It is a plain file, so the worker lists it with the SHA-256 of its bytes like any other.
  it("describes the app for installing, with icons that exist", () => {
    const html = readFileSync("index.html", "utf8");
    const description = /<meta name="description" content="([^"]+)"/.exec(html)![1];
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8")) as { icons: { src: string; sizes: string }[] };
    expect(manifest).toEqual({
      name: "Before You Tape", short_name: "Before You Tape", description, start_url: "/", scope: "/", display: "standalone",
      background_color: "#fff3e6", theme_color: "#fff3e6",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    });
    for (const icon of manifest.icons) {
      const png = readFileSync(`public${icon.src}`);
      const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
      expect(`${w}x${h}`, icon.src).toBe(icon.sizes);
    }
  });
});

// Each file's revision is the SHA-256 of its bytes, so the worker can refuse any other bytes for it.
describe("sha256Revisions", () => {
  it("sets every entry's revision to the SHA-256 of its built file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "byt-rev-"));
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "index.html"), "<html></html>");
    writeFileSync(join(dir, "assets", "a-123.js"), "x");
    const sha = (t: string) => createHash("sha256").update(t).digest("hex");
    const { manifest } = await sha256Revisions(dir)([{ url: "index.html", revision: "md5", size: 13 }, { url: "assets/a-123.js", revision: null, size: 1 }]);
    expect(manifest).toEqual([{ url: "index.html", revision: sha("<html></html>"), size: 13 }, { url: "assets/a-123.js", revision: sha("x"), size: 1 }]);
  });

  it("fails the build for a listed file that is not there", async () => {
    await expect(sha256Revisions(mkdtempSync(join(tmpdir(), "byt-rev-")))([{ url: "gone.js", revision: null, size: 0 }])).rejects.toThrow(/gone\.js/);
  });
});

