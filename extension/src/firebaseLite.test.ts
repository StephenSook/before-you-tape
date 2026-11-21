// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { createProductCloudPort } from "../../src/ai/firebaseModels";
import { initPanelFirebase } from "./firebaseLite";

it("the panel's Firebase file never imports App Check or Auth", () => {
  const source = readFileSync(new URL("./firebaseLite.ts", import.meta.url), "utf8");
  expect(source).not.toMatch(/app-check|firebase\/auth|src\/firebase\/app/);
  const { ai } = initPanelFirebase();
  expect(ai.app.options.projectId).toBe("on-device-only");
  expect(ai.app.options.apiKey).toBe("on-device-only");
});

it("a direct cloud call from the panel fails at a local refusal control, without credentials", async () => {
  const fetchControl = vi.fn(async (_url: string, init?: RequestInit) => {
    void init;
    return new Response(JSON.stringify({ error: { code: 403, message: "local refusal control" } }), { status: 403 });
  });
  vi.stubGlobal("fetch", fetchControl);
  try {
    const direct = createProductCloudPort(initPanelFirebase().ai, "gemini-3.5-flash-lite");
    await expect(direct.generate(JSON.stringify("Test input"))).rejects.toThrow(/403/);
    expect(fetchControl).toHaveBeenCalledOnce();
    const [url, init] = fetchControl.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.has("x-firebase-appcheck")).toBe(false);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.get("x-goog-api-key") ?? new URL(url).searchParams.get("key")).toBe("on-device-only");
  } finally {
    vi.unstubAllGlobals();
  }
});
