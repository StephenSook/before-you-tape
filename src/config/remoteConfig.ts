// The app's config from Remote Config: fetched on load, the in-app defaults while it loads or when offline,
// and live updates while the page is open, so kill_cloud takes effect without a reload.
import type { FirebaseApp } from "firebase/app";
import { activate, fetchAndActivate, getRemoteConfig, getValue, onConfigUpdate } from "firebase/remote-config";
import { CONFIG_DEFAULTS } from "./defaults";
import { isAllowedCloudModel } from "./models";
import type { SecondLookPolicy } from "../routing/policy";

// pauseUnknown: Remote Config has not yet given a kill_cloud value of its own, so cloud checks stay off.
export type AppConfig = typeof CONFIG_DEFAULTS & { pauseUnknown?: true };

export const RC_KEYS = {
  cloudModelItem: "cloud_model_item",
  cloudModelItemFallback: "cloud_model_item_fallback",
  cloudModelText: "cloud_model_text",
  killCloud: "kill_cloud",
  secondLook: "second_look_policy_json",
  rulesEditionId: "rules_edition_id",
  rulesEditionSha256: "rules_edition_sha256",
} as const;

export const RC_DEFAULTS: Record<string, string | boolean> = {
  [RC_KEYS.cloudModelItem]: CONFIG_DEFAULTS.cloudModelItem,
  [RC_KEYS.cloudModelItemFallback]: CONFIG_DEFAULTS.cloudModelItemFallback,
  [RC_KEYS.cloudModelText]: CONFIG_DEFAULTS.cloudModelText,
  [RC_KEYS.killCloud]: CONFIG_DEFAULTS.killCloud,
  [RC_KEYS.secondLook]: JSON.stringify(CONFIG_DEFAULTS.secondLook),
  [RC_KEYS.rulesEditionId]: CONFIG_DEFAULTS.rulesEditionId,
  [RC_KEYS.rulesEditionSha256]: CONFIG_DEFAULTS.rulesEditionSha256,
};

type Read = (key: string) => { asString(): string; asBoolean(): boolean };

// A model name must be on the allow-list, so a stray value or a shut-down model is never sent.
const model = (raw: string, fallback: string) => (isAllowedCloudModel(raw.trim()) ? raw.trim() : fallback);

const POLICY_KEYS = ["whMismatch", "batteryNumbers", "notSure", "hazardNoLabel", "identity"] as const;

// The policy must name all five reasons with true or false; anything else keeps the default.
function policy(raw: string): SecondLookPolicy {
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null || Array.isArray(v)) return CONFIG_DEFAULTS.secondLook;
    const o = v as Record<string, unknown>;
    if (!POLICY_KEYS.every((k) => typeof o[k] === "boolean")) return CONFIG_DEFAULTS.secondLook;
    return Object.fromEntries(POLICY_KEYS.map((k) => [k, o[k]])) as unknown as SecondLookPolicy;
  } catch {
    return CONFIG_DEFAULTS.secondLook;
  }
}

// A newer rule edition needs both a safe id and a 64-hex SHA-256; otherwise the built-in edition is used.
function editionPin(id: string, sha: string): { rulesEditionId: string; rulesEditionSha256: string } {
  const i = id.trim();
  const h = sha.trim().toLowerCase();
  return /^[a-z0-9-]{1,64}$/.test(i) && /^[0-9a-f]{64}$/.test(h) ? { rulesEditionId: i, rulesEditionSha256: h } : { rulesEditionId: "", rulesEditionSha256: "" };
}

export function readConfig(get: Read): AppConfig {
  return {
    cloudModelItem: model(get(RC_KEYS.cloudModelItem).asString(), CONFIG_DEFAULTS.cloudModelItem),
    // Empty turns the fallback off; anything else must be on the allow-list.
    cloudModelItemFallback: get(RC_KEYS.cloudModelItemFallback).asString().trim() === ""
      ? ""
      : model(get(RC_KEYS.cloudModelItemFallback).asString(), CONFIG_DEFAULTS.cloudModelItemFallback),
    cloudModelText: model(get(RC_KEYS.cloudModelText).asString(), CONFIG_DEFAULTS.cloudModelText),
    killCloud: get(RC_KEYS.killCloud).asBoolean(),
    secondLook: policy(get(RC_KEYS.secondLook).asString()),
    ...editionPin(get(RC_KEYS.rulesEditionId).asString(), get(RC_KEYS.rulesEditionSha256).asString()),
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
  // Cloud checks stay off until Remote Config has given a kill_cloud value of its own, fetched now or fetched
  // before and cached. A fetch that fails or is blocked, with nothing cached, keeps them off; checks on the
  // device still work. The in-app default never switches the cloud on.
  const pausedUntilKnown = (c: AppConfig): AppConfig => ({ ...c, killCloud: true, pauseUnknown: true });
  let current: AppConfig = pausedUntilKnown({ ...CONFIG_DEFAULTS });
  const refresh = () => {
    const read = readConfig((key) => getValue(rc, key));
    current = getValue(rc, RC_KEYS.killCloud).getSource() === "remote" ? read : pausedUntilKnown(read);
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
