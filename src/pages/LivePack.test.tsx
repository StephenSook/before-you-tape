import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ed } from "../../tests/engine/helpers";
import type { ItemModels, ModelPort } from "../ai/port";
import { CONFIG_DEFAULTS } from "../config/defaults";
import type { AppConfig, ConfigSource } from "../config/remoteConfig";
import { createBoxStore } from "../data/boxStore";
import type { ItemRead } from "../shared/itemRead";
import { LivePack } from "./LivePack";

const read: ItemRead = {
  itemName: "Body lotion", category: "lotion_cream", labelText: "SHEA BODY LOTION 8 FL OZ", volts: 0, milliampHours: 0, wattHours: 0,
  lithiumGrams: 0, batteryWords: false, liquid: true, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false,
  glassContainer: false, powder: false, retailBox: "cannot_tell", evidence: "label_read",
};
const port = (): ModelPort & { generate: ReturnType<typeof vi.fn> } => ({ generate: vi.fn(async () => ({ text: JSON.stringify(read), source: "in_cloud" as const })) });

// A config source the test can change, like a live Remote Config update.
function fakeSource(start: Partial<AppConfig> = {}) {
  let current: AppConfig = { ...CONFIG_DEFAULTS, ...start };
  const listeners = new Set<(c: AppConfig) => void>();
  const source: ConfigSource = { get: () => current, subscribe: (l) => { listeners.add(l); return () => { listeners.delete(l); }; }, ready: Promise.resolve() };
  return { source, push: (c: Partial<AppConfig>) => { current = { ...current, ...c }; for (const l of listeners) l(current); } };
}

let n = 0;
function setup(start: Partial<AppConfig> = {}) {
  const models: Record<string, ItemModels & Record<"device" | "hybrid" | "cloud" | "fallback", ReturnType<typeof port>>> = {};
  // Keyed by the main name only; the tests read the fallback name from the calls.
  const makeModels = vi.fn((...[name]: [string, string]) => (models[name] ??= { device: port(), hybrid: port(), cloud: port(), fallback: port() }));
  const store = createBoxStore({ edition: () => ed, persistence: { save: () => {}, load: async () => null }, now: () => 0, today: () => "2026-11-20", newId: () => `l${n++}` });
  store.setConsent(true);
  const cfg = fakeSource(start);
  render(<LivePack source={cfg.source} makeModels={makeModels} store={store} gate="no_api" openCamera={async () => ({ stream: { getTracks: () => [] } as unknown as MediaStream, stop: () => {} })}
    index={[{ code: "CA", name: "Canada", immUrl: "https://pe.usps.com/text/imm/ce_003.htm" }]} saveCrop={async () => {}} online />);
  return { models, makeModels, push: cfg.push };
}
const photo = new File(["x"], "lotion.jpg", { type: "image/jpeg" });

describe("LivePack", () => {
  beforeAll(() => { vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined); });
  beforeEach(() => { vi.stubGlobal("createImageBitmap", vi.fn(async () => { const c = document.createElement("canvas"); c.width = 64; c.height = 64; return c; })); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("reads in the cloud with the model Remote Config names", async () => {
    const { models, makeModels } = setup({ cloudModelItem: "gemini-3.8-flash" });
    expect(makeModels).toHaveBeenCalledWith("gemini-3.8-flash", CONFIG_DEFAULTS.cloudModelItemFallback);
    await userEvent.upload(screen.getByTestId("upload-input"), photo);
    await screen.findByTestId("item-card");
    expect(models["gemini-3.8-flash"]?.cloud.generate).toHaveBeenCalledTimes(1);
  });

  it("makes zero model calls on reads once kill_cloud turns on, the fallback included, without a reload", async () => {
    const { models, push } = setup();
    act(() => push({ killCloud: true }));
    expect(screen.getByTestId("paused-banner")).toHaveTextContent("Cloud checks are paused.");
    await userEvent.upload(screen.getByTestId("upload-input"), photo);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    const all = Object.values(models).flatMap((m) => [m.cloud.generate, m.hybrid.generate, m.device.generate, m.fallback.generate]);
    expect(all).toHaveLength(4);
    for (const g of all) expect(g).not.toHaveBeenCalled();
  });

  it("builds new models only when a model name changes, the fallback included", () => {
    const { makeModels, push } = setup();
    expect(makeModels).toHaveBeenCalledTimes(1);
    act(() => push({ killCloud: true }));
    expect(makeModels).toHaveBeenCalledTimes(1);
    act(() => push({ cloudModelItem: "gemini-3.8-flash" }));
    expect(makeModels).toHaveBeenLastCalledWith("gemini-3.8-flash", "gemini-3.8-flash");
    act(() => push({ cloudModelItemFallback: "gemini-4-argon" }));
    expect(makeModels).toHaveBeenLastCalledWith("gemini-3.8-flash", "gemini-4-argon");
    expect(makeModels).toHaveBeenCalledTimes(3);
  });
});
