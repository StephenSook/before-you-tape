// The routes the hosting serves the app on (firebase.json rewrites to /index.html), so the service worker opens the
// cached page for exactly those, matched on the path alone as the hosting matches them, and leaves every other page,
// such as /privacy/ or /support/, to the network. Shared by the build config and the worker itself.
export interface Rewrite { regex?: string; source?: string; destination: string }

export function appRoutes(rewrites: readonly Rewrite[]): RegExp[] {
  return rewrites.filter((r) => r.destination === "/index.html").map((r) => {
    if (!r.regex) throw new Error(`the rewrite of ${r.source ?? "?"} to /index.html has no regex the worker can use`);
    return new RegExp(r.regex);
  });
}
