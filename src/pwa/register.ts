// Registers the service worker (src/pwa/sw.ts) and watches for new versions. A new version installs in the
// background and waits; the page shows the update line, and only the tab where the visitor presses Reload switches
// to it and reloads. Another tab whose worker switched meanwhile keeps its page and offers Reload too, so no tab
// ever reloads without its own tap. It checks for a new version when the tab is shown again and every hour, since
// a tab left open, or moving only within the app, would otherwise never look.
import { markUpdateReady } from "./update";

const HOUR = 3_600_000;

export interface SwEnv {
  container: ServiceWorkerContainer;
  document: Document;
  reload(): void;
  every(ms: number, f: () => void): void;
}

const browser = (): SwEnv => ({
  container: navigator.serviceWorker,
  document,
  reload: () => window.location.reload(),
  every: (ms, f) => { window.setInterval(f, ms); },
});

export async function registerServiceWorker(env: SwEnv = browser()): Promise<void> {
  const { container } = env;
  // Whether this tab was served by a worker: until it is, a worker taking over is the first one, not an update.
  let controlled = container.controller !== null;
  // Whether the visitor pressed Reload in this tab.
  let asked = false;
  const offer = (w: ServiceWorker) => markUpdateReady(async () => { asked = true; w.postMessage({ type: "SKIP_WAITING" }); });

  container.addEventListener("controllerchange", () => {
    if (asked) env.reload();
    else if (controlled) markUpdateReady(async () => env.reload());
    controlled = true;
  });

  const registration = await container.register("/sw.js", { scope: "/" });
  const watch = (w: ServiceWorker | null) => {
    if (!w) return;
    const ready = () => { if (w.state === "installed" && container.controller) offer(w); };
    w.addEventListener("statechange", ready);
    ready();
  };
  if (registration.waiting && container.controller) offer(registration.waiting);
  watch(registration.installing);
  registration.addEventListener("updatefound", () => watch(registration.installing));

  const check = () => { void registration.update().catch(() => undefined); };
  env.document.addEventListener("visibilitychange", () => { if (env.document.visibilityState === "visible") check(); });
  env.every(HOUR, check);
}

// The kill switch's page side: a kill build's page unregisters every worker of this site and deletes every cache on
// each load, and registers none. The kill worker does the same when it activates; this repeats it from the page, so
// a kill worker stopped part way through its cleanup still leaves the browser clean on the next visit.
export async function removeServiceWorkers(env: { container: Pick<ServiceWorkerContainer, "getRegistrations">; caches: CacheStorage }
  = { container: navigator.serviceWorker, caches }): Promise<void> {
  for (const registration of await env.container.getRegistrations()) await registration.unregister();
  for (const name of await env.caches.keys()) await env.caches.delete(name);
}
