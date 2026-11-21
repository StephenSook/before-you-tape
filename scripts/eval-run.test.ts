import { describe, expect, it } from "vitest";
import template from "../remoteconfig.template.json";
import pkg from "../package.json";
import { evalEnv, evalProjectId, evalToken, liveModels, parseEnvFile, preflight, responseNote } from "./eval-run";

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

  const own = "VITE_FB_API_KEY=eval-key\nVITE_FB_AUTH_DOMAIN=lab.firebaseapp.com\nVITE_FB_PROJECT_ID=lab-project\nVITE_FB_APP_ID=1:2:web:eval\nVITE_RECAPTCHA_SITE_KEY=any\nVITE_USE_EMULATORS=false\n";
  const files = (evalFile: string | null) => ({ ".env.eval.local": evalFile, ".env.local": "VITE_FB_PROJECT_ID=before-you-tape-2026\n" });

  it("takes the eval token from the environment or the Keychain item, and refuses an empty one", () => {
    expect(evalToken({ APPCHECK_DEBUG_TOKEN: "t-env" }, () => "t-key")).toBe("t-env");
    expect(evalToken({}, () => "t-key\n")).toBe("t-key");
    // `security find-generic-password -w` exits 0 on an item with an empty value, so the length decides.
    expect(() => evalToken({}, () => "")).toThrow(/byt-eval-appcheck-debug-token is empty/);
    expect(() => evalToken({}, () => { throw new Error("not found"); })).toThrow(/no App Check debug token/);
  });

  it("checks every precondition before it starts anything, and stops at the first that fails", () => {
    const ok = { argv: ["--date", "2026-11-21"], env: { BYT_NANO_PROFILE: "/p", APPCHECK_DEBUG_TOKEN: "t" }, file: (f: string) => files(own)[f as keyof ReturnType<typeof files>] ?? null, keychain: () => "" };
    expect(preflight(ok)).toMatchObject({ project: "lab-project", date: "2026-11-21", repeat: 1, profile: "/p", token: "t" });
    expect(() => preflight({ ...ok, argv: [] })).toThrow(/--date/);
    expect(() => preflight({ ...ok, argv: ["--date", "2026-11-21", "--repeat", "0"] })).toThrow(/--repeat/);
    expect(() => preflight({ ...ok, file: (f: string) => files(null)[f as keyof ReturnType<typeof files>] ?? null })).toThrow(/no \.env\.eval\.local/);
    expect(() => preflight({ ...ok, env: { APPCHECK_DEBUG_TOKEN: "t" } })).toThrow(/BYT_NANO_PROFILE/);
    expect(() => preflight({ ...ok, env: { BYT_NANO_PROFILE: "/p" } })).toThrow(/byt-eval-appcheck-debug-token is empty/);
    expect(preflight(ok).paths).toEqual(["device", "cloud", "shipped"]);
    expect(preflight({ ...ok, argv: ["--date", "2026-11-21", "--paths", "cloud"] }).paths).toEqual(["cloud"]);
    expect(() => preflight({ ...ok, argv: ["--date", "2026-11-21", "--paths", "cloud,moon"] })).toThrow(/--paths/);
  });

  it("chains no npm script with ';', so a failed step always stops the next", () => {
    expect(Object.entries(pkg.scripts).filter(([, v]) => v.includes(";")).map(([k]) => k)).toEqual([]);
  });

  it("notes a Google API response by host, path, status and error message, with no query, body or token", () => {
    const body = JSON.stringify({ error: { code: 403, message: "Firebase App Check token is invalid.", status: "PERMISSION_DENIED" } });
    expect(responseNote("https://firebasevertexai.googleapis.com/v1beta/projects/p/models/m:generateContent?key=AIzaSECRET", 403, body)).toEqual({
      host: "firebasevertexai.googleapis.com", path: "/v1beta/projects/p/models/m:generateContent", status: 403,
      error: "PERMISSION_DENIED: Firebase App Check token is invalid.",
    });
    expect(responseNote("https://firebaseappcheck.googleapis.com/v1/projects/p/apps/a:exchangeDebugToken", 200, '{"token":"secret-token","ttl":"3600s"}'))
      .toEqual({ host: "firebaseappcheck.googleapis.com", path: "/v1/projects/p/apps/a:exchangeDebugToken", status: 200, error: null });
    expect(JSON.stringify(responseNote("https://x.googleapis.com/a?key=AIzaSECRET", 200, '{"token":"secret-token"}'))).not.toMatch(/SECRET|secret-token/);
  });
});
