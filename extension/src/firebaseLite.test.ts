// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { initPanelFirebase } from "./firebaseLite";

it("the panel's Firebase file never imports App Check or Auth", () => {
  const source = readFileSync(new URL("./firebaseLite.ts", import.meta.url), "utf8");
  expect(source).not.toMatch(/app-check|firebase\/auth|src\/firebase\/app/);
  const { ai } = initPanelFirebase();
  expect(ai.app.options.projectId).toBe("on-device-only");
  expect(ai.app.options.apiKey).toBe("on-device-only");
});
