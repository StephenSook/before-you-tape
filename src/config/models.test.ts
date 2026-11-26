import { describe, expect, it } from "vitest";
import { readFiles } from "../../scripts/lib/files";
import { CONFIG_DEFAULTS } from "./defaults";
import { CLOUD_MODELS, isAllowedCloudModel, MODELS_RECHECK_BY } from "./models";

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

  it("pins every model id in shipped code, scripts and the Remote Config template to the list", () => {
    const files = readFiles([":(glob)src/**", ":(glob)scripts/**", "remoteconfig.template.json", ":(exclude,glob)**/*.test.ts", ":(exclude,glob)**/*.test.tsx"]);
    expect(files.length).toBeGreaterThan(40);
    const ids = new Set(files.flatMap((f) => [...f.text.matchAll(/gemini-[a-z0-9][a-z0-9.-]*/g)].map((m) => m[0])));
    expect([...ids].sort()).toEqual(["gemini-3.5-flash-lite", "gemini-3.8-flash"]);
    for (const id of ids) expect(isAllowedCloudModel(id), id).toBe(true);
  });

  it("is re-read on the models page by its re-check date", () => {
    expect(MODELS_RECHECK_BY).toBe("2026-12-22");
    const today = new Date().toISOString().slice(0, 10);
    expect(today <= MODELS_RECHECK_BY, `re-read ${CLOUD_MODELS[0].source} and update the checked dates (due ${MODELS_RECHECK_BY})`).toBe(true);
  });
});
