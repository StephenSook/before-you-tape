import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { appRoutes, pwaOptions, type Rewrite } from "./scripts/pwa-options";
import { versionInfo } from "./scripts/version-info";

// The routes the hosting serves the app on, read from firebase.json so the worker and the hosting cannot disagree.
const hosting = (JSON.parse(readFileSync(new URL("./firebase.json", import.meta.url), "utf8")) as { hosting: { rewrites: Rewrite[] } }).hosting;

// Writes dist/version.json so the live site can prove which commit it serves. `dirty` is true when the
// tree had uncommitted or untracked changes at build time, so the commit alone would not describe it.
// A copy with no git history builds with the commit "unknown"; CI and the deploy check it is the real one.
function versionFile(): Plugin {
  return {
    name: "byt-version-file",
    apply: "build",
    generateBundle() {
      const { sha, dirty } = versionInfo((args) =>
        execFileSync("git", [...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
      if (sha === "unknown") this.warn("no git history: dist/version.json records the commit as unknown");
      this.emitFile({
        type: "asset",
        fileName: "edition.json",
        source: readFileSync(new URL("./rules/edition.json", import.meta.url)),
      });
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ sha, dirty, builtAt: new Date().toISOString() }) + "\n",
      });
    },
  };
}

export default defineConfig({
  // BYT_SW_KILL=1 builds the kill switch: a worker that unregisters itself and deletes its caches (scripts/pwa-options.ts).
  plugins: [react(), versionFile(), VitePWA(pwaOptions({ kill: process.env.BYT_SW_KILL === "1", routes: appRoutes(hosting.rewrites) }))],
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL("./index.html", import.meta.url)),
        extBridge: fileURLToPath(new URL("./ext-bridge.html", import.meta.url)),
      },
    },
  },
});
