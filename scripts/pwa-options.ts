// The service worker's build settings (vite-plugin-pwa, injectManifest), kept apart from vite.config.ts so a test
// can hold them. The worker itself is src/pwa/sw.ts, written here rather than generated: it caches only the app's
// own shell, so the page opens and checks typed items by the bundled rules with no network, and caches nothing at
// run time, so model, database, sign-in and App Check calls go to Google's hosts and are never answered from a cache.
// With the kill switch on, the same worker is built with no files to cache, and a worker with none removes itself
// and every cache.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { VitePWAOptions } from "vite-plugin-pwa";

export { appRoutes, type Rewrite } from "../src/pwa/routes";

interface ListedFile { url: string; revision: string | null; size: number }

// Sets each listed file's revision to the SHA-256 of its built bytes, so the worker stores a file only if the bytes
// it fetched are this build's (src/pwa/sw.ts). A listed file missing from the build fails the build.
export function sha256Revisions(dir: string) {
  return async (entries: ListedFile[]) => ({
    manifest: entries.map((e) => {
      let bytes: Buffer;
      try { bytes = readFileSync(join(dir, e.url)); } catch { throw new Error(`the worker lists ${e.url}, which the build does not have`); }
      return { ...e, revision: createHash("sha256").update(bytes).digest("hex") };
    }),
    warnings: [] as string[],
  });
}

export const SHELL = ["index.html", "assets/*.{js,css}", "fonts/**/*.woff2", "favicon.svg", "icons/*.png", "manifest.webmanifest"];

export function pwaOptions(o: { kill: boolean }): Partial<VitePWAOptions> {
  return {
    strategies: "injectManifest",
    srcDir: "src/pwa",
    filename: "sw.ts",
    // The page registers the worker itself (src/pwa/register.ts), so no tab ever reloads without its own tap.
    injectRegister: false,
    // The web app manifest is public/manifest.webmanifest, linked from index.html; icons drawn from public/favicon.svg
    // (rsvg-convert at 192 and 512; the maskable one on the page color, inset). The plugin adds no files of its own,
    // so each listed file goes through sha256Revisions.
    manifest: false,
    includeManifestIcons: false,
    injectManifest: {
      globPatterns: o.kill ? [] : SHELL,
      globIgnores: ["assets/extBridge-*", "assets/crashlyticsSdk-*"],
      rollupFormat: "iife",
      // The build's output folder (vite.config.ts keeps the default).
      manifestTransforms: [sha256Revisions("dist")],
    },
  };
}
