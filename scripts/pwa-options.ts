// The service worker's settings (vite-plugin-pwa), kept apart from vite.config.ts so a test can hold them.
// It caches only the app's own shell, so the page opens and checks typed items by the bundled rules with no
// network. It caches nothing at run time: model, database, sign-in and App Check calls go to Google's hosts and are
// never answered from a cache. A new version waits until the visitor asks for it, so an open page is never reloaded
// under them. With the kill switch on, the build ships a worker that unregisters itself and deletes its caches.
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

export function pwaOptions(o: { kill: boolean; routes: RegExp[] }): Partial<VitePWAOptions> {
  return {
    registerType: "prompt",
    injectRegister: false,
    selfDestroying: o.kill,
    manifest: false,
    workbox: {
      globPatterns: ["index.html", "assets/*.{js,css}", "fonts/**/*.woff2", "favicon.svg"],
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
