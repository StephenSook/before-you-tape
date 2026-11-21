import { prepareDeviceModel } from "../../../src/ai/deviceModel";
import { createProductDevicePort, PRODUCT_CREATE_OPTIONS } from "../../../src/ai/firebaseModels";
import { checkGate, hasLanguageModelApi } from "../../../src/ai/gate";
import { ReadFailure } from "../../../src/ai/itemRead";
import { readProductText } from "../../../src/ai/productText";
import { BRIDGE_PATH } from "../../../src/bridge/protocol";
import { openBridge } from "../bridgeClient";
import { initPanelFirebase } from "../firebaseLite";
import type { DeviceProductReader } from "./ProductText";
import { createRoot } from "react-dom/client";
import { extensionChrome, tabStorageKey, type TabInfo } from "../tabInfo";
import { bundledEdition, EDITION_URL, fetchCurrentEdition, loadEdition } from "../edition";
import { Panel, type PanelProps } from "./Panel";
import "./panel.css";

const { storage, windows } = extensionChrome();
const root = createRoot(document.getElementById("root")!);

const languageModel = () => (globalThis as { LanguageModel?: unknown }).LanguageModel;
const device: DeviceProductReader = {
  check: () => checkGate(languageModel(), PRODUCT_CREATE_OPTIONS),
  prepare: (onProgress) => prepareDeviceModel(initPanelFirebase().ai, onProgress),
  read: (text) => {
    const lm = languageModel();
    if (!hasLanguageModelApi(lm)) throw new ReadFailure("device_failed", "this browser has no on-device model API");
    return readProductText(createProductDevicePort(initPanelFirebase().ai, lm), text, "on_device", () => performance.now());
  },
};

const bridgeUrl = new URL(BRIDGE_PATH, EDITION_URL).href;
const connectCloud: PanelProps["connectCloud"] = (signal) => openBridge(document, bridgeUrl, 6000, signal);

const loadTab: PanelProps["loadTab"] = (onTab) => {
  let active = true;
  let changed = false;
  let key: string | undefined;
  const update = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area !== "session" || key === undefined) return;
    const change = changes[key];
    if (!change) return;
    changed = true;
    onTab((change.newValue as TabInfo | null | undefined) ?? null);
  };
  void windows.getCurrent().then(async ({ id }) => {
    if (!active || id === undefined) return;
    key = tabStorageKey(id);
    storage.onChanged.addListener(update);
    const cache = await storage.session.get([key]);
    if (active && !changed) onTab((cache[key] as TabInfo | null | undefined) ?? null);
  }).catch(() => {});
  return () => {
    active = false;
    storage.onChanged.removeListener(update);
  };
};

const fetchEdition: PanelProps["fetchEdition"] = async (signal) => {
  const cache = await storage.local.get(["ruleEdition"]).catch((): Record<string, unknown> => ({}));
  const loaded = await loadEdition({
    bundled: bundledEdition, cached: cache.ruleEdition ?? null,
    fetchJson: () => fetchCurrentEdition(signal),
  });
  if (!signal.aborted && loaded.from === "live") {
    await storage.local.set({ ruleEdition: loaded.edition }).catch(() => {});
  }
  return loaded;
};

void storage.local.get(["agreed", "cloudConsent"]).catch((): Record<string, unknown> => ({})).then(({ agreed, cloudConsent }) => {
  root.render(
    <Panel
      agreed={agreed === true}
      device={device}
      connectCloud={connectCloud}
      cloudConsent={typeof cloudConsent === "boolean" ? cloudConsent : null}
      saveAgreement={() => storage.local.set({ agreed: true })}
      saveCloudConsent={(allowed) => storage.local.set({ cloudConsent: allowed })}
      clearStorage={async () => {
        await storage.local.clear();
        await storage.session.clear();
      }}
      loadTab={loadTab}
      fetchEdition={fetchEdition}
    />,
  );
});
