import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Unit tests never read the developer's .env files: the tests folder holds none, so a run on a laptop
  // with real Firebase settings behaves the same as CI without them.
  envDir: "./tests",
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts", "tests/**/*.test.ts", "functions/src/**/*.test.ts"],
    // The Firestore rules tests need the emulator: npm run test:rules.
    exclude: ["tests/e2e/**", "tests/firestore/**", "node_modules/**"],
  },
});
