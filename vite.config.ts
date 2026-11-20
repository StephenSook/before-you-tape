import { execFileSync } from "node:child_process";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
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
        fileName: "version.json",
        source: JSON.stringify({ sha, dirty, builtAt: new Date().toISOString() }) + "\n",
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), versionFile()],
});
