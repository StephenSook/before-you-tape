/// <reference types="vite-plugin-pwa/vanillajs" />
// Registers the service worker (scripts/pwa-options.ts) once the page has loaded. A new version installs in the
// background and waits: the page shows the update line, and switches to it and reloads only when the visitor
// presses Reload. Nothing here takes over or reloads an open page by itself.
import { registerSW } from "virtual:pwa-register";
import { markUpdateReady } from "./update";

export function registerServiceWorker(): void {
  const updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh: () => markUpdateReady(() => updateServiceWorker(true)),
  });
}
