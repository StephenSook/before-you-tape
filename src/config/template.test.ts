import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RC_DEFAULTS, RC_KEYS } from "./remoteConfig";

interface Param { defaultValue: { value: string }; valueType: "STRING" | "BOOLEAN" | "NUMBER" | "JSON"; description: string }
const template = JSON.parse(readFileSync(join(__dirname, "..", "..", "remoteconfig.template.json"), "utf8")) as { parameters: Record<string, Param> };
const clients = JSON.parse(readFileSync(join(__dirname, "..", "..", "remoteconfig.clients.json"), "utf8")) as Record<string, string[]>;
const firebaseJson = JSON.parse(readFileSync(join(__dirname, "..", "..", "firebase.json"), "utf8")) as { remoteconfig?: { template?: string } };
const PLATFORM = /_(ios|android)$/;

describe("remoteconfig.template.json", () => {
  const params = Object.entries(template.parameters);

  // A bare `firebase deploy` must never publish the template over live values such as kill_cloud;
  // the template goes out only through scripts/rc-publish.ts, which reads live first.
  it("is not named in firebase.json, so no plain deploy can publish it", () => expect(firebaseJson.remoteconfig).toBeUndefined());

  it("names every key in lower snake case, with a description", () => {
    for (const [key, p] of params) {
      expect(key, key).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(p.description.length, key).toBeGreaterThan(10);
    }
  });

  it("has exactly the web keys the app reads, with the app's own defaults and types", () => {
    const web = params.filter(([k]) => !PLATFORM.test(k));
    expect(web.map(([k]) => k).sort()).toEqual(Object.keys(RC_DEFAULTS).sort());
    for (const [key, p] of web) {
      const app = RC_DEFAULTS[key];
      expect(p.defaultValue.value, key).toBe(String(app));
      expect(p.valueType, key).toBe(typeof app === "boolean" ? "BOOLEAN" : key.endsWith("_json") ? "JSON" : "STRING");
    }
  });

  it("accepts keys for the phone apps, including their minimum versions", () => {
    for (const k of ["minimum_version_ios", "minimum_version_android"]) {
      expect(template.parameters[k]?.valueType, k).toBe("STRING");
      expect(template.parameters[k]?.defaultValue.value, k).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("lists the web client's keys exactly as the web app reads them", () =>
    expect([...(clients.web ?? [])].sort()).toEqual(Object.values(RC_KEYS).sort()));

  it("holds every key the web, iOS and Android clients read, and no key that no client reads", () => {
    expect(Object.keys(clients).sort()).toEqual(["android", "ios", "web"]);
    const read = new Set(Object.values(clients).flat());
    for (const k of read) expect(template.parameters[k], k).toBeDefined();
    for (const k of Object.keys(template.parameters)) expect(read.has(k), k).toBe(true);
  });
});
