// The service worker's settings (vite-plugin-pwa), kept apart from vite.config.ts so a test can hold them.
// It caches only the app's own shell, so the page opens and checks typed items by the bundled rules with no
// network. It caches nothing at run time: model, database, sign-in and App Check calls go to Google's hosts and are
// never answered from a cache. A new version waits until the visitor asks for it, so an open page is never reloaded
// under them. With the kill switch on, the build ships a worker that unregisters itself and deletes its caches.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { VitePWAOptions } from "vite-plugin-pwa";

export interface Rewrite { regex?: string; source?: string; destination: string }

// The routes the hosting serves the app on (firebase.json rewrites to /index.html), so the worker opens the cached
// page for exactly those and leaves every other page, such as /privacy/ or /support/, to the network.
export function appRoutes(rewrites: readonly Rewrite[]): RegExp[] {
  return rewrites.filter((r) => r.destination === "/index.html").map((r) => {
    if (!r.regex) throw new Error(`the rewrite of ${r.source ?? "?"} to /index.html has no regex the worker can use`);
    return new RegExp(r.regex);
  });
}

// The page's own description (index.html), so the installed app and the page describe it the same way. Read from
// the package root, where npm runs the build and the tests.
function pageDescription(): string {
  const m = /<meta name="description" content="([^"]+)"/.exec(readFileSync(join(process.cwd(), "index.html"), "utf8"));
  if (!m) throw new Error("index.html has no description for the web app manifest");
  return m[1]!;
}

export function pwaOptions(o: { kill: boolean; routes: RegExp[] }): Partial<VitePWAOptions> {
  return {
    registerType: "prompt",
    injectRegister: false,
    selfDestroying: o.kill,
    // Icons drawn from public/favicon.svg (rsvg-convert at 192 and 512; the maskable one on the page color, inset).
    manifest: {
      name: "Before You Tape", short_name: "Before You Tape", description: pageDescription(), start_url: "/", scope: "/",
      display: "standalone", background_color: "#fff3e6", theme_color: "#fff3e6",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    workbox: {
      globPatterns: ["index.html", "assets/*.{js,css}", "fonts/**/*.woff2", "favicon.svg", "icons/*.png"],
      globIgnores: ["assets/extBridge-*"],
      runtimeCaching: [],
      navigateFallback: "index.html",
      navigateFallbackAllowlist: o.routes,
      skipWaiting: false,
      clientsClaim: true,
      cleanupOutdatedCaches: true,
    },
  };
}
