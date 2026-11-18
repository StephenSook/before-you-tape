import { execFileSync } from "node:child_process";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Writes dist/version.json so the live site can prove which commit it serves.
function versionFile(): Plugin {
  return {
    name: "byt-version-file",
    apply: "build",
    generateBundle() {
      const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
      if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`git rev-parse HEAD returned ${sha}`);
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ sha, builtAt: new Date().toISOString() }) + "\n",
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), versionFile()],
});
