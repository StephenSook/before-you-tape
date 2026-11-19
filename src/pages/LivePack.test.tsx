import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ed } from "../../tests/engine/helpers";
import type { ItemModels, ModelPort } from "../ai/port";
import { CONFIG_DEFAULTS } from "../config/defaults";
import type { AppConfig, ConfigSource } from "../config/remoteConfig";
import { noPersistence } from "../data/boxOps";
import { createBoxStore } from "../data/boxStore";
import type { ItemRead } from "../shared/itemRead";
import { LivePack } from "./LivePack";

const read: ItemRead = {
  itemName: "Body lotion", category: "lotion_cream", labelText: "SHEA BODY LOTION 8 FL OZ", volts: 0, milliampHours: 0, wattHours: 0,
  lithiumGrams: 0, batteryWords: false, liquid: true, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false,
  glassContainer: false, powder: false, retailBox: "cannot_tell", evidence: "label_read",
};
const port = (r: ItemRead = read, source: "on_device" | "in_cloud" = "in_cloud"): ModelPort & { generate: ReturnType<typeof vi.fn> } =>
  ({ generate: vi.fn(async () => ({ text: JSON.stringify(r), source })) });
// An on-device read whose printed Wh does not match volts times capacity: the policy asks for a second look.
const phoneOnDevice: ItemRead = { ...read, itemName: "Phone", category: "phone", labelText: "LI-ION 3.7V 2500mAh 9.62Wh", liquid: false, volts: 3.7, milliampHours: 2500, wattHours: 9.62, batteryWords: true };

// A config source the test can change, like a live Remote Config update.
function fakeSource(start: Partial<AppConfig> = {}) {
  let current: AppConfig = { ...CONFIG_DEFAULTS, ...start };
  const listeners = new Set<(c: AppConfig) => void>();
  const retry = vi.fn(async () => {});
  const source: ConfigSource = { get: () => current, subscribe: (l) => { listeners.add(l); return () => { listeners.delete(l); }; }, ready: Promise.resolve(), retry };
  return { source, retry, push: (c: Partial<AppConfig>) => { current = { ...current, ...c }; for (const l of listeners) l(current); } };
}

let n = 0;
function setup(start: Partial<AppConfig> = {}, gate: "no_api" | "available" = "no_api") {
  const models: Record<string, ItemModels & Record<"device" | "hybrid" | "cloud" | "fallback", ReturnType<typeof port>>> = {};
  // Keyed by the main name only; the tests read the fallback name from the calls.
  const hybrid = () => (gate === "available" ? port(phoneOnDevice, "on_device") : port());
  const makeModels = vi.fn((...[name]: [string, string]) => (models[name] ??= { device: port(), hybrid: hybrid(), cloud: port(), fallback: port() }));
  const store = createBoxStore({ edition: () => ed, persistence: noPersistence(), now: () => 0, today: () => "2026-11-20", newId: () => `l${n++}` });
  store.setConsent(true);
  const cfg = fakeSource(start);
  render(<LivePack source={cfg.source} makeModels={makeModels} store={store} gate={gate} openCamera={async () => ({ stream: { getTracks: () => [] } as unknown as MediaStream, stop: () => {} })}
    index={[{ code: "CA", name: "Canada", immUrl: "https://pe.usps.com/text/imm/ce_003.htm" }]} saveCrop={async () => {}} online />);
  return { models, makeModels, push: cfg.push, retry: cfg.retry };
}
const photo = new File(["x"], "lotion.jpg", { type: "image/jpeg" });
// Adds a photo and presses "Check this part" on the crop step, as a sender does.
const addPhoto = async () => {
  await userEvent.upload(screen.getByTestId("upload-input"), photo);
  const send = await screen.findByRole("button", { name: "Check this part" });
  await waitFor(() => expect(send).toBeEnabled());
  await userEvent.click(send);
};

describe("LivePack", () => {
  beforeAll(() => { vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined); });
  beforeEach(() => { vi.stubGlobal("createImageBitmap", vi.fn(async () => { const c = document.createElement("canvas"); c.width = 64; c.height = 64; return c; })); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("reads in the cloud with the model Remote Config names", async () => {
    const { models, makeModels } = setup({ cloudModelItem: "gemini-3.8-flash" });
    expect(makeModels).toHaveBeenCalledWith("gemini-3.8-flash", CONFIG_DEFAULTS.cloudModelItemFallback);
    await addPhoto();
    await screen.findByTestId("item-card");
    expect(models["gemini-3.8-flash"]?.cloud.generate).toHaveBeenCalledTimes(1);
  });

  it("makes zero model calls on reads once kill_cloud turns on, the fallback included, without a reload", async () => {
    const { models, push } = setup();
    act(() => push({ killCloud: true }));
    expect(screen.getByTestId("paused-banner")).toHaveTextContent("Cloud checks are paused.");
    await addPhoto();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    const all = Object.values(models).flatMap((m) => [m.cloud.generate, m.hybrid.generate, m.device.generate, m.fallback.generate]);
    expect(all).toHaveLength(4);
    for (const g of all) expect(g).not.toHaveBeenCalled();
  });

  it("aborts a cloud read in flight the moment kill_cloud turns on, before the page re-renders", async () => {
    let signal: AbortSignal | undefined;
    const cloud = { generate: vi.fn((_p: string, _i?: unknown, o?: { signal?: AbortSignal }) => { signal = o?.signal; return new Promise<never>(() => {}); }) };
    const makeModels = () => ({ device: port(), hybrid: port(), cloud, fallback: port() });
    const store = createBoxStore({ edition: () => ed, persistence: noPersistence(), now: () => 0, today: () => "2026-11-20", newId: () => `l${n++}` });
    store.setConsent(true);
    const cfg = fakeSource();
    render(<LivePack source={cfg.source} makeModels={makeModels} store={store} gate="no_api" openCamera={async () => ({ stream: { getTracks: () => [] } as unknown as MediaStream, stop: () => {} })}
      index={[{ code: "CA", name: "Canada", immUrl: "https://pe.usps.com/text/imm/ce_003.htm" }]} saveCrop={async () => {}} online />);
    await addPhoto();
    await waitFor(() => expect(cloud.generate).toHaveBeenCalledTimes(1));
    expect(signal?.aborted).toBe(false);
    // Subscribed after the page, so it sees the state at the moment the update is announced.
    let abortedWhenAnnounced: boolean | undefined;
    cfg.source.subscribe(() => { abortedWhenAnnounced = signal?.aborted; });
    act(() => cfg.push({ killCloud: true }));
    expect(abortedWhenAnnounced).toBe(true);
  });

  it("says cloud checks wait for their settings while the pause is not known yet, and reads nothing in the cloud", async () => {
    const { models, push } = setup();
    act(() => push({ killCloud: true, pauseUnknown: true }));
    expect(screen.getByTestId("paused-banner")).toHaveTextContent("Cloud checks start once their settings load. Checks on this laptop still work.");
    await addPhoto();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Cloud checks are waiting for their settings"));
    for (const m of Object.values(models)) expect(m.cloud.generate).not.toHaveBeenCalled();
  });

  it("offers to load the cloud settings again while they are not known, and asks Remote Config again", async () => {
    const { push, retry } = setup();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    act(() => push({ killCloud: true, pauseUnknown: true }));
    await userEvent.click(within(screen.getByTestId("paused-banner")).getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
    act(() => push({ killCloud: true, pauseUnknown: undefined }));
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("passes the second-look policy from Remote Config to the page", async () => {
    const { models, push } = setup({}, "available");
    act(() => push({ secondLook: { whMismatch: false, batteryNumbers: false, notSure: false, hazardNoLabel: false, identity: false } }));
    await addPhoto();
    await screen.findByTestId("item-card");
    const m = Object.values(models)[0];
    expect(m?.hybrid.generate).toHaveBeenCalledTimes(1);
    expect(m?.cloud.generate).not.toHaveBeenCalled();
  });

  it("runs the second look by default, as a control for the policy test", async () => {
    const { models } = setup({}, "available");
    await addPhoto();
    await screen.findByTestId("second-look");
    expect(Object.values(models)[0]?.cloud.generate).toHaveBeenCalledTimes(1);
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
