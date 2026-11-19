import { defineConfig } from "vitest/config";

// The Firestore rules tests need the local emulator; `npm run test:rules` starts it around this run.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/firestore/**/*.test.ts", "functions/src/**/*.emulator.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
