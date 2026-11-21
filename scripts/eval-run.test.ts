import { describe, expect, it } from "vitest";
import template from "../remoteconfig.template.json";
import { evalEnv, evalProjectId, liveModels, parseEnvFile } from "./eval-run";

describe("eval-run", () => {
  it("runs only against an eval project, never the live one, and never with no project named", () => {
    expect(() => evalProjectId({})).toThrow(/VITE_FB_PROJECT_ID is not set in \.env\.eval\.local/);
    expect(() => evalProjectId({ VITE_FB_PROJECT_ID: "  " })).toThrow(/is not set/);
    expect(() => evalProjectId({ VITE_FB_PROJECT_ID: "before-you-tape-2026" })).toThrow(/refusing the live project before-you-tape-2026/);
    expect(evalProjectId({ VITE_FB_PROJECT_ID: "qwiklabs-gcp-01-abc" })).toBe("qwiklabs-gcp-01-abc");
  });

  it("uses the cloud models the live app is set to, from the Remote Config template", () => {
    expect(liveModels(template)).toEqual({ cloud: "gemini-3.5-flash-lite", fallback: "gemini-3.8-flash" });
    expect(() => liveModels({ parameters: {} })).toThrow(/cloud_model_item/);
  });

  it("reads the eval project's own settings file, with every key set there, and never a copy of the live config", () => {
    const own = "VITE_FB_API_KEY=eval-key\nVITE_FB_AUTH_DOMAIN=lab.firebaseapp.com\nVITE_FB_PROJECT_ID=qwiklabs-gcp-01-abc\n" +
      "VITE_FB_APP_ID=1:2:web:eval\nVITE_RECAPTCHA_SITE_KEY=any\nVITE_USE_EMULATORS=false\n# a comment\n";
    const live = parseEnvFile("VITE_FB_API_KEY=live-key\nVITE_FB_APP_ID=1:2:web:live\nVITE_FB_PROJECT_ID=before-you-tape-2026\n");
    expect(parseEnvFile(own).VITE_FB_PROJECT_ID).toBe("qwiklabs-gcp-01-abc");
    expect(evalEnv(own, live)).toBe("qwiklabs-gcp-01-abc");
    expect(() => evalEnv(null, live)).toThrow(/no \.env\.eval\.local/);
    expect(() => evalEnv(own.replace("VITE_FB_APP_ID=1:2:web:eval\n", ""), live)).toThrow(/VITE_FB_APP_ID is not set in \.env\.eval\.local/);
    expect(() => evalEnv(own.replace("eval-key", "live-key"), live)).toThrow(/VITE_FB_API_KEY is the live project's/);
    expect(() => evalEnv(own.replace("VITE_USE_EMULATORS=false", "VITE_USE_EMULATORS=true"), live)).toThrow(/VITE_USE_EMULATORS/);
    expect(() => evalEnv(own.replace("qwiklabs-gcp-01-abc", "before-you-tape-2026"), live)).toThrow(/refusing the live project/);
  });
});
