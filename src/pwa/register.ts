/// <reference types="vite-plugin-pwa/vanillajs" />
// Registers the service worker (scripts/pwa-options.ts) once the page has loaded. A new version installs in the
// background and waits; nothing here takes over or reloads an open page.
import { registerSW } from "virtual:pwa-register";

export function registerServiceWorker(): void {
  registerSW({ immediate: true });
}
