// The app's config from Remote Config: fetched on load, the in-app defaults while it loads or when offline,
// and live updates while the page is open, so kill_cloud takes effect without a reload.
import type { FirebaseApp } from "firebase/app";
import { activate, fetchAndActivate, getRemoteConfig, getValue, onConfigUpdate } from "firebase/remote-config";
import { CONFIG_DEFAULTS } from "./defaults";
import { isAllowedCloudModel } from "./models";

export type AppConfig = typeof CONFIG_DEFAULTS;

export const RC_KEYS = {
  cloudModelItem: "cloud_model_item",
  cloudModelItemFallback: "cloud_model_item_fallback",
  cloudModelText: "cloud_model_text",
  killCloud: "kill_cloud",
} as const;

export const RC_DEFAULTS: Record<string, string | boolean> = {
  [RC_KEYS.cloudModelItem]: CONFIG_DEFAULTS.cloudModelItem,
  [RC_KEYS.cloudModelItemFallback]: CONFIG_DEFAULTS.cloudModelItemFallback,
  [RC_KEYS.cloudModelText]: CONFIG_DEFAULTS.cloudModelText,
  [RC_KEYS.killCloud]: CONFIG_DEFAULTS.killCloud,
};

type Read = (key: string) => { asString(): string; asBoolean(): boolean };

// A model name must be on the allow-list, so a stray value or a shut-down model is never sent.
const model = (raw: string, fallback: string) => (isAllowedCloudModel(raw.trim()) ? raw.trim() : fallback);

export function readConfig(get: Read): AppConfig {
  return {
    cloudModelItem: model(get(RC_KEYS.cloudModelItem).asString(), CONFIG_DEFAULTS.cloudModelItem),
    // Empty turns the fallback off; anything else must be on the allow-list.
    cloudModelItemFallback: get(RC_KEYS.cloudModelItemFallback).asString().trim() === ""
      ? ""
      : model(get(RC_KEYS.cloudModelItemFallback).asString(), CONFIG_DEFAULTS.cloudModelItemFallback),
    cloudModelText: model(get(RC_KEYS.cloudModelText).asString(), CONFIG_DEFAULTS.cloudModelText),
    killCloud: get(RC_KEYS.killCloud).asBoolean(),
  };
}

export interface ConfigSource {
  get(): AppConfig;
  subscribe(listener: (c: AppConfig) => void): () => void;
  ready: Promise<void>;
}

export function remoteConfigSource(app: FirebaseApp, minimumFetchIntervalMillis = 3_600_000): ConfigSource {
  const rc = getRemoteConfig(app);
  rc.defaultConfig = { ...RC_DEFAULTS };
  rc.settings.minimumFetchIntervalMillis = minimumFetchIntervalMillis;
  rc.settings.fetchTimeoutMillis = 10_000;
  const listeners = new Set<(c: AppConfig) => void>();
  let current: AppConfig = { ...CONFIG_DEFAULTS };
  const refresh = () => {
    current = readConfig((key) => getValue(rc, key));
    for (const l of listeners) l(current);
  };
  // A failed fetch (offline, blocked) leaves the defaults in place.
  const ready = fetchAndActivate(rc).then(refresh, refresh);
  onConfigUpdate(rc, {
    next: () => { void activate(rc).then(refresh, () => undefined); },
    error: () => undefined,
    complete: () => undefined,
  });
  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    ready,
  };
}
