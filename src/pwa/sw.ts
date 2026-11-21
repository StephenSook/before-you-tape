// The app's service worker (built by scripts/pwa-options.ts, which injects the list of the app's own shell files).
//
// - It caches each version's shell in a cache of its own, and answers this site's own files from it. It stores a
//   file only if its bytes match the SHA-256 the build listed for it, so a version's cache can hold only that
//   version's files, even if a deploy is rolled back while it installs; on any mismatch the install fails. It answers
//   nothing else: model, database, sign-in and App Check calls go to Google's hosts and never meet a cache here.
// - It opens the cached page only for the app's own routes (firebase.json rewrites), matched on the path alone, so
//   a link with a query string opens offline too, and /privacy/ or /support/ stay with the network.
// - A new version installs and waits. It takes over only when a tab asks (SKIP_WAITING), and the tab that asked is
//   the only one the page reloads (src/pwa/register.ts).
// - It keeps the version before it, so a tab still running the old app keeps loading the old app's files after
//   another tab switched over, until that tab reloads.
// - Built with no files to cache (the kill switch), it removes itself and every cache instead.
import firebase from "../../firebase.json";
import { appRoutes, type Rewrite } from "./routes";

interface WaitableEvent extends Event { waitUntil(p: Promise<unknown>): void }
interface SwFetchEvent extends WaitableEvent { request: Request; respondWith(r: Promise<Response>): void }
interface SwMessageEvent extends WaitableEvent { data: unknown }
interface SwWindowClient { url: string; navigate(url: string): Promise<unknown> }
interface SwScope {
  __WB_MANIFEST: { url: string; revision: string | null }[];
  location: Location;
  registration: { unregister(): Promise<boolean> };
  clients: { claim(): Promise<void>; matchAll(o: { type: "window" }): Promise<SwWindowClient[]> };
  skipWaiting(): Promise<void>;
  addEventListener(type: "install" | "activate", l: (e: WaitableEvent) => void): void;
  addEventListener(type: "fetch", l: (e: SwFetchEvent) => void): void;
  addEventListener(type: "message", l: (e: SwMessageEvent) => void): void;
}

const sw = self as unknown as SwScope;
const ENTRIES = (self as unknown as SwScope).__WB_MANIFEST;
const PREFIX = "byt-shell-";
const META = "byt-meta";
const ORDER = new URL("/__byt/versions", sw.location.origin).href;
const KEEP = 2;

// FNV-1a of the file list, so each build's shell has a cache of its own.
function versionOf(entries: readonly unknown[]): string {
  let h = 0x811c9dc5;
  for (const ch of JSON.stringify(entries)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

async function removeEverything(): Promise<void> {
  const names = await caches.keys();
  await Promise.all(names.map((name) => caches.delete(name)));
  await sw.registration.unregister();
  const windows = await sw.clients.matchAll({ type: "window" });
  await Promise.all(windows.map((client) => client.navigate(client.url).catch(() => undefined)));
}

if (ENTRIES.length === 0) {
  sw.addEventListener("install", () => { void sw.skipWaiting(); });
  sw.addEventListener("activate", (event) => event.waitUntil(removeEverything()));
} else {
  const CACHE = PREFIX + versionOf(ENTRIES);
  const FILES = new Set(ENTRIES.map((e) => new URL(e.url, sw.location.origin).href));
  const PAGE = new URL("/index.html", sw.location.origin).href;
  const routes = appRoutes((firebase as { hosting: { rewrites: Rewrite[] } }).hosting.rewrites);

  const readOrder = async (): Promise<string[]> => {
    const r = await (await caches.open(META)).match(ORDER);
    const v: unknown = r ? await r.json().catch(() => []) : [];
    return Array.isArray(v) ? v.filter((n): n is string => typeof n === "string") : [];
  };

  const sha256 = async (bytes: ArrayBuffer) =>
    [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");

  sw.addEventListener("install", (event) => {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      for (const entry of ENTRIES) {
        const url = new URL(entry.url, sw.location.origin).href;
        const res = await fetch(new Request(url, { cache: "reload" }));
        if (!res.ok) throw new Error(`${entry.url} answered ${res.status}`);
        const bytes = await res.arrayBuffer();
        if (entry.revision === null || (await sha256(bytes)) !== entry.revision) throw new Error(`${entry.url} is not this version's file`);
        await cache.put(url, new Response(bytes, { status: res.status, statusText: res.statusText, headers: res.headers }));
      }
    })());
  });

  // Keeps this version and the one before it; any older shell, and the cache of a worker this site no longer
  // ships, is deleted.
  sw.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
      const keep = [...(await readOrder()).filter((n) => n !== CACHE), CACHE].slice(-KEEP);
      for (const name of await caches.keys()) {
        if (name !== META && !keep.includes(name)) await caches.delete(name);
      }
      await (await caches.open(META)).put(ORDER, new Response(JSON.stringify(keep), { headers: { "Content-Type": "application/json" } }));
      await sw.clients.claim();
    })());
  });

  sw.addEventListener("message", (event) => {
    if ((event.data as { type?: unknown } | null)?.type === "SKIP_WAITING") void sw.skipWaiting();
  });

  sw.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.origin !== sw.location.origin) return;
    if (request.mode === "navigate") {
      if (!routes.some((re) => re.test(url.pathname))) return;
      event.respondWith((async () => (await (await caches.open(CACHE)).match(PAGE)) ?? fetch(request))());
      return;
    }
    const href = url.origin + url.pathname;
    if (FILES.has(href)) {
      event.respondWith((async () => (await (await caches.open(CACHE)).match(href)) ?? fetch(request))());
      return;
    }
    // A file only an older version names: a tab still running that version asks for it after the switch.
    if (url.pathname.startsWith("/assets/")) {
      event.respondWith((async () => {
        for (const name of (await readOrder()).reverse()) {
          const hit = await (await caches.open(name)).match(href);
          if (hit) return hit;
        }
        return fetch(request);
      })());
    }
  });
}
