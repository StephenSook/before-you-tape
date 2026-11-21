// Removes this site's service worker and everything it cached. Nothing on this release registers it. It is here so
// a browser that installed a worker from a later release finds it at /sw.js on its next update check if that release
// is rolled back to this one: the browser is then left with no worker and no cached app, and each open tab reloads
// once onto the release now live.
self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
    await self.registration.unregister();
    const windows = await self.clients.matchAll({ type: "window" });
    await Promise.all(windows.map((client) => client.navigate(client.url).catch(() => undefined)));
  })());
});
