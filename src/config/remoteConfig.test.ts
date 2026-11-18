import { beforeEach, describe, expect, it, vi } from "vitest";

const rcState = vi.hoisted(() => ({
  values: {} as Record<string, string>,
  fetchFails: false,
  observer: null as null | { next: (u: unknown) => void },
  rc: { defaultConfig: {} as Record<string, unknown>, settings: { minimumFetchIntervalMillis: 0, fetchTimeoutMillis: 0 } },
}));
vi.mock("firebase/remote-config", () => {
  const value = (key: string) => {
    const raw = rcState.values[key] ?? String(rcState.rc.defaultConfig[key] ?? "");
    return { asString: () => raw, asBoolean: () => raw === "true" };
  };
  return {
    getRemoteConfig: vi.fn(() => rcState.rc),
    getValue: vi.fn((_rc: unknown, key: string) => value(key)),
    fetchAndActivate: vi.fn(async () => { if (rcState.fetchFails) throw new Error("offline"); return true; }),
    activate: vi.fn(async () => true),
    onConfigUpdate: vi.fn((_rc: unknown, observer: { next: (u: unknown) => void }) => { rcState.observer = observer; return () => {}; }),
  };
});

import type { FirebaseApp } from "firebase/app";
import { fetchAndActivate, onConfigUpdate } from "firebase/remote-config";
import { CONFIG_DEFAULTS } from "./defaults";
import { RC_DEFAULTS, readConfig, remoteConfigSource } from "./remoteConfig";

const app = {} as FirebaseApp;
const values = (v: Record<string, string>) => (key: string) => ({ asString: () => v[key] ?? "", asBoolean: () => v[key] === "true" });

describe("readConfig", () => {
  it("maps the Remote Config keys to the app's config", () => {
    expect(readConfig(values({ cloud_model_item: "gemini-3.8-flash", cloud_model_item_fallback: "gemini-3.5-flash-lite", cloud_model_text: "gemini-3.8-flash", kill_cloud: "true" })))
      .toEqual({ cloudModelItem: "gemini-3.8-flash", cloudModelItemFallback: "gemini-3.5-flash-lite", cloudModelText: "gemini-3.8-flash", killCloud: true });
  });

  it("keeps the default model when a value is not a Gemini model name", () => {
    expect(readConfig(values({ cloud_model_item: "", cloud_model_item_fallback: "drop table", cloud_model_text: "drop table", kill_cloud: "false" })))
      .toEqual({ ...CONFIG_DEFAULTS, killCloud: false });
  });

  it("keeps the default for a Gemini model name that is not on the allow-list", () =>
    expect(readConfig(values({ cloud_model_item: "gemini-2.5-flash", cloud_model_item_fallback: "gemini-4-argon", cloud_model_text: "gemini-3.5-flash", kill_cloud: "false" })))
      .toEqual({ ...CONFIG_DEFAULTS, killCloud: false }));

  it("turns the fallback off when its value is empty", () =>
    expect(readConfig(values({ cloud_model_item: "gemini-3.5-flash-lite", cloud_model_item_fallback: " ", cloud_model_text: "gemini-3.5-flash-lite", kill_cloud: "false" })).cloudModelItemFallback).toBe(""));

  it("gives Remote Config the in-app defaults under its own key names", () =>
    expect(RC_DEFAULTS).toEqual({ cloud_model_item: "gemini-3.5-flash-lite", cloud_model_item_fallback: "gemini-3.8-flash", cloud_model_text: "gemini-3.5-flash-lite", kill_cloud: false }));
});

describe("remoteConfigSource", () => {
  beforeEach(() => {
    rcState.values = {};
    rcState.fetchFails = false;
    rcState.observer = null;
    rcState.rc.defaultConfig = {};
    vi.clearAllMocks();
  });

  it("starts on the defaults, fetches on load, and then uses the fetched values", async () => {
    rcState.values = { kill_cloud: "true" };
    const source = remoteConfigSource(app);
    expect(rcState.rc.defaultConfig).toEqual(RC_DEFAULTS);
    await source.ready;
    expect(fetchAndActivate).toHaveBeenCalledTimes(1);
    expect(source.get().killCloud).toBe(true);
  });

  it("keeps the defaults when the fetch fails, as when offline", async () => {
    rcState.fetchFails = true;
    const source = remoteConfigSource(app);
    await source.ready;
    expect(source.get()).toEqual(CONFIG_DEFAULTS);
  });

  it("tells subscribers when a live update turns kill_cloud on", async () => {
    const source = remoteConfigSource(app);
    await source.ready;
    const seen = vi.fn();
    source.subscribe(seen);
    expect(onConfigUpdate).toHaveBeenCalledTimes(1);
    rcState.values = { kill_cloud: "true" };
    rcState.observer?.next({ getUpdatedKeys: () => new Set(["kill_cloud"]) });
    await vi.waitFor(() => expect(seen).toHaveBeenCalledWith(expect.objectContaining({ killCloud: true })));
    expect(source.get().killCloud).toBe(true);
  });
});
