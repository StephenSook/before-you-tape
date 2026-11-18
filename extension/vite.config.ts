import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  base: "./",
  publicDir: false,
  envDir: false,
  plugins: [
    react(),
    {
      name: "extension-static-files",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "manifest.json", source: readFileSync(`${root}manifest.json`) });
        this.emitFile({
          type: "asset", fileName: "extension-privacy.html",
          source: readFileSync(new URL("../public/extension-privacy.html", import.meta.url)),
        });
      },
    },
  ],
  build: {
    target: "chrome138",
    rollupOptions: {
      input: { sidepanel: `${root}sidepanel.html`, background: `${root}src/background.ts` },
      output: { entryFileNames: "[name].js" },
    },
  },
});
