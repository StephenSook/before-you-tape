import { describe, expect, it } from "vitest";
import { CONFIG_DEFAULTS } from "./defaults";
import { CLOUD_MODELS, isAllowedCloudModel } from "./models";

describe("CLOUD_MODELS", () => {
  it("records each model's stage, shutdown and the date its status was read, with the page", () => {
    expect(CLOUD_MODELS.map((m) => m.name)).toEqual(["gemini-3.5-flash-lite", "gemini-3.8-flash"]);
    for (const m of CLOUD_MODELS) {
      expect(m.stage, m.name).toBe("Stable");
      expect(m.shutdown, m.name).toBe("none listed");
      expect(m.checked, m.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(m.source, m.name).toBe("https://firebase.google.com/docs/ai-logic/models");
    }
  });

  it("holds every model the app sends by default", () => {
    for (const name of [CONFIG_DEFAULTS.cloudModelItem, CONFIG_DEFAULTS.cloudModelItemFallback, CONFIG_DEFAULTS.cloudModelText]) {
      expect(isAllowedCloudModel(name), name).toBe(true);
    }
    for (const name of ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-x", ""]) expect(isAllowedCloudModel(name), name).toBe(false);
  });
});
