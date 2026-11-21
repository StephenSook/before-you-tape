// The service worker's build settings (vite-plugin-pwa, injectManifest), kept apart from vite.config.ts so a test
// can hold them. The worker itself is src/pwa/sw.ts, written here rather than generated: it caches only the app's
// own shell, so the page opens and checks typed items by the bundled rules with no network, and caches nothing at
// run time, so model, database, sign-in and App Check calls go to Google's hosts and are never answered from a cache.
// With the kill switch on, the same worker is built with no files to cache, and a worker with none removes itself
// and every cache.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { VitePWAOptions } from "vite-plugin-pwa";

export { appRoutes, type Rewrite } from "../src/pwa/routes";

// The page's own description (index.html), so the installed app and the page describe it the same way. Read from
// the package root, where npm runs the build and the tests.
function pageDescription(): string {
  const m = /<meta name="description" content="([^"]+)"/.exec(readFileSync(join(process.cwd(), "index.html"), "utf8"));
  if (!m) throw new Error("index.html has no description for the web app manifest");
  return m[1]!;
}

export const SHELL = ["index.html", "assets/*.{js,css}", "fonts/**/*.woff2", "favicon.svg", "icons/*.png"];

export function pwaOptions(o: { kill: boolean }): Partial<VitePWAOptions> {
  return {
    strategies: "injectManifest",
    srcDir: "src/pwa",
    filename: "sw.ts",
    // The page registers the worker itself (src/pwa/register.ts), so no tab ever reloads without its own tap.
    injectRegister: false,
    // Icons drawn from public/favicon.svg (rsvg-convert at 192 and 512; the maskable one on the page color, inset).
    manifest: o.kill ? false : {
      name: "Before You Tape", short_name: "Before You Tape", description: pageDescription(), start_url: "/", scope: "/",
      display: "standalone", background_color: "#fff3e6", theme_color: "#fff3e6",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    includeManifestIcons: !o.kill,
    injectManifest: {
      globPatterns: o.kill ? [] : SHELL,
      globIgnores: ["assets/extBridge-*"],
      rollupFormat: "iife",
    },
  };
}
