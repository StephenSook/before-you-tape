import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { pwaOptions } from "./scripts/pwa-options";
import { versionInfo } from "./scripts/version-info";


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
  // Under vitest the worker is not generated: the unit tests that build only inspect the bundle, and the plugin writes
  // sw.js to disk even when the build writes nothing. The browser tests check the worker from the real build.
  plugins: [react(), versionFile(), VitePWA({
    ...pwaOptions({ kill: process.env.BYT_SW_KILL === "1" }),
    disable: process.env.VITEST !== undefined,
  })],
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL("./index.html", import.meta.url)),
        extBridge: fileURLToPath(new URL("./ext-bridge.html", import.meta.url)),
      },
    },
  },
});
