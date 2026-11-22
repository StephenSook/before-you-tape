import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ed } from "../../tests/engine/helpers";
import type { ItemModels, ModelPort } from "../ai/port";
import { CONFIG_DEFAULTS } from "../config/defaults";
import type { AppConfig, ConfigSource } from "../config/remoteConfig";
import { noPersistence } from "../data/boxOps";
import { createBoxStore } from "../data/boxStore";
import { deviceConsent, type DeviceConsent } from "../data/deviceConsent";
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
type PageOver = { settingsWaitMs?: number; settingsNoticeMs?: number; online?: boolean; today?: string };
function setup(start: Partial<AppConfig> = {}, gate: "no_api" | "available" = "no_api", page: PageOver = {}, consent?: DeviceConsent) {
  const models: Record<string, ItemModels & Record<"device" | "hybrid" | "cloud" | "fallback", ReturnType<typeof port>>> = {};
  // Keyed by the main name only; the tests read the fallback name from the calls.
  const hybrid = () => (gate === "available" ? port(phoneOnDevice, "on_device") : port());
  const makeModels = vi.fn((...[name]: [string, string]) => (models[name] ??= { device: port(), hybrid: hybrid(), cloud: port(), fallback: port() }));
  const store = createBoxStore({ edition: () => ed, persistence: noPersistence(), now: () => 0, today: () => "2026-11-20", newId: () => `l${n++}`, ...(consent ? { consent } : {}) });
  store.setConsent(true);
  const cfg = fakeSource(start);
  const ui = (over: PageOver) => <LivePack source={cfg.source} makeModels={makeModels} store={store} gate={gate} openCamera={async () => ({ stream: { getTracks: () => [] } as unknown as MediaStream, stop: () => {} })}
    index={[{ code: "CA", name: "Canada", immUrl: "https://pe.usps.com/text/imm/ce_003.htm" }]} saveCrop={async () => {}} deleteCrop={async () => {}} online {...page} {...over} />;
  const view = render(ui({}));
  return { models, makeModels, push: cfg.push, retry: cfg.retry, store, rerender: (over: PageOver) => view.rerender(ui(over)) };
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

  it("shows the holiday mailing clock as soon as Remote Config gives its dates, with no reload", () => {
    const { push } = setup({ holidayDates: [] }, "no_api", { today: "2026-11-21" });
    expect(screen.queryByTestId("deadline-clock")).toBeNull();
    act(() => push({ holidayDates: [{ service: "Priority Mail International", sendBy: "2026-12-09", deliverBy: "2026-12-25", sourceUrl: "https://www.usps.com/holiday/holiday-shipping-dates.htm", checkedOn: "2026-11-21" }] }));
    expect(screen.getByTestId("deadline-clock")).toHaveTextContent("18 days left.");
  });

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
      index={[{ code: "CA", name: "Canada", immUrl: "https://pe.usps.com/text/imm/ce_003.htm" }]} saveCrop={async () => {}} deleteCrop={async () => {}} online />);
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
    const { models, push } = setup({}, "no_api", { settingsWaitMs: 50, settingsNoticeMs: 0 });
    act(() => push({ killCloud: true, pauseUnknown: true }));
    expect(screen.getByTestId("paused-banner")).toHaveTextContent("Cloud checks start once their settings load.");
    // This laptop has no model of its own, so the banner does not say checks on it still work.
    expect(screen.getByTestId("paused-banner")).not.toHaveTextContent("still work");
    await addPhoto();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Cloud checks are still waiting for their settings"));
    for (const m of Object.values(models)) expect(m.cloud.generate).not.toHaveBeenCalled();
  });

  // A photo added in the first moment, before Remote Config has answered, used to be turned away by the
  // fail-closed default; the notice vanished when the settings landed, and the photo was lost with no word.
  it("holds a photo added before the settings load, says it is getting ready, and reads it once they arrive", async () => {
    const { models, push } = setup();
    act(() => push({ killCloud: true, pauseUnknown: true }));
    await addPhoto();
    expect(await screen.findByTestId("getting-ready")).toHaveTextContent("Getting ready to check. One moment.");
    for (const m of Object.values(models)) expect(m.cloud.generate).not.toHaveBeenCalled();
    act(() => push({ killCloud: false, pauseUnknown: undefined }));
    expect(await screen.findByTestId("item-card")).toBeInTheDocument();
    expect(Object.values(models).reduce((k, m) => k + m.cloud.generate.mock.calls.length, 0)).toBe(1);
    expect(screen.queryByTestId("getting-ready")).toBeNull();
  });

  it("decides a waiting photo again with the connection as it is after the wait, not as it was at the press", async () => {
    const { models, push, rerender } = setup({}, "no_api", { online: false });
    act(() => push({ killCloud: true, pauseUnknown: true }));
    await addPhoto();
    expect(await screen.findByTestId("getting-ready")).toBeInTheDocument();
    rerender({ online: true });
    act(() => push({ killCloud: false, pauseUnknown: undefined }));
    expect(await screen.findByTestId("item-card")).toBeInTheDocument();
    expect(Object.values(models).reduce((k, m) => k + m.cloud.generate.mock.calls.length, 0)).toBe(1);
  });

  it("ends a waiting photo when cloud checks are turned off, and never sends it when they are turned on again", async () => {
    const { models, push, store } = setup();
    act(() => push({ killCloud: true, pauseUnknown: true }));
    await addPhoto();
    expect(await screen.findByTestId("getting-ready")).toBeInTheDocument();
    act(() => store.setConsent(false));
    await waitFor(() => expect(screen.queryByTestId("getting-ready")).toBeNull());
    expect(screen.getByRole("alert")).toHaveTextContent("This device can't read photos on its own, and cloud checks are off. Type the item instead.");
    act(() => store.setConsent(true));
    act(() => push({ killCloud: false, pauseUnknown: undefined }));
    await new Promise((r) => setTimeout(r, 150));
    for (const m of Object.values(models)) expect(m.cloud.generate).not.toHaveBeenCalled();
    expect(screen.queryByTestId("item-card")).toBeNull();
  });

  it("says cloud checks are paused when the settings that arrive during the wait pause them", async () => {
    const { models, push } = setup();
    act(() => push({ killCloud: true, pauseUnknown: true }));
    await addPhoto();
    expect(await screen.findByTestId("getting-ready")).toBeInTheDocument();
    act(() => push({ killCloud: true, pauseUnknown: undefined }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Cloud checks are paused, and this laptop can't read photos on its own. Type the item instead."));
    for (const m of Object.values(models)) expect(m.cloud.generate).not.toHaveBeenCalled();
  });

  it("says the page is offline, not that the settings are slow, when a photo waited while offline", async () => {
    const { models, push } = setup({}, "no_api", { settingsWaitMs: 50, online: false });
    act(() => push({ killCloud: true, pauseUnknown: true }));
    await addPhoto();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("You're offline, and this laptop can't read photos on its own."));
    for (const m of Object.values(models)) expect(m.cloud.generate).not.toHaveBeenCalled();
  });

  it("keeps its notice when the settings do not load in time, even after they arrive later", async () => {
    const { models, push } = setup({}, "no_api", { settingsWaitMs: 50 });
    act(() => push({ killCloud: true, pauseUnknown: true }));
    await addPhoto();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Cloud checks are still waiting for their settings. Try again in a moment, or type the item."));
    act(() => push({ killCloud: false, pauseUnknown: undefined }));
    expect(screen.getByRole("alert")).toHaveTextContent("Cloud checks are still waiting for their settings. Try again in a moment, or type the item.");
    expect(screen.queryByTestId("item-card")).toBeNull();
    for (const m of Object.values(models)) expect(m.cloud.generate).not.toHaveBeenCalled();
  });

  it("says the cloud settings are missing only once they have been missing a while, so the page does not jump on every load", async () => {
    const { push } = setup({}, "no_api", { settingsNoticeMs: 80 });
    // Settings that land before the limit never show the notice.
    act(() => push({ killCloud: true, pauseUnknown: true }));
    expect(screen.queryByTestId("paused-banner")).toBeNull();
    act(() => push({ killCloud: false, pauseUnknown: undefined }));
    await act(async () => { await new Promise((r) => setTimeout(r, 150)); });
    expect(screen.queryByTestId("paused-banner")).toBeNull();
    // Settings still missing after the limit: the notice and its button show, and go once the settings land.
    act(() => push({ killCloud: true, pauseUnknown: true }));
    expect(screen.queryByTestId("paused-banner")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("paused-banner")).toHaveTextContent("Cloud checks start once their settings load."));
    expect(within(screen.getByTestId("paused-banner")).getByRole("button", { name: "Try again" })).toBeInTheDocument();
    act(() => push({ killCloud: false, pauseUnknown: undefined }));
    expect(screen.queryByTestId("paused-banner")).toBeNull();
  });

  it("says at once when cloud checks are paused on purpose", () => {
    const { push } = setup({}, "no_api", { settingsNoticeMs: 60_000 });
    act(() => push({ killCloud: true }));
    expect(screen.getByTestId("paused-banner")).toHaveTextContent("Cloud checks are paused.");
  });

  it("offers to load the cloud settings again while they are not known, and asks Remote Config again", async () => {
    const { push, retry } = setup({}, "no_api", { settingsNoticeMs: 0 });
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

  // A read on the device can land before Remote Config's settings (cloud checks are off until they do), or while
  // kill_cloud is on: the second look the rules asked for waits for cloud checks to come on, instead of being lost.
  const deviceReadsPhone = (models: ReturnType<typeof setup>["models"]) => {
    const m = Object.values(models)[0]!;
    m.device.generate.mockResolvedValue({ text: JSON.stringify(phoneOnDevice), source: "on_device" });
    return m;
  };
  it("runs a second look the rules asked for once Remote Config's settings arrive", async () => {
    const { models, push } = setup({ killCloud: true, pauseUnknown: true }, "available");
    const m = deviceReadsPhone(models);
    await addPhoto();
    await screen.findByText("Read on this laptop");
    expect(m.cloud.generate).not.toHaveBeenCalled();
    act(() => push({ killCloud: false, pauseUnknown: undefined }));
    await screen.findByTestId("second-look");
    expect(m.cloud.generate).toHaveBeenCalledTimes(1);
  });
  it("runs a second look the rules asked for once kill_cloud is switched off", async () => {
    const { models, push } = setup({ killCloud: true }, "available");
    const m = deviceReadsPhone(models);
    await addPhoto();
    await screen.findByText("Read on this laptop");
    expect(m.cloud.generate).not.toHaveBeenCalled();
    act(() => push({ killCloud: false }));
    await screen.findByTestId("second-look");
    expect(m.cloud.generate).toHaveBeenCalledTimes(1);
  });
  it("sends no waiting second look when the sender took cloud checks back meanwhile", async () => {
    const { models, push, store } = setup({ killCloud: true, pauseUnknown: true }, "available");
    const m = deviceReadsPhone(models);
    await addPhoto();
    await screen.findByText("Read on this laptop");
    // A no, then a yes again, before cloud checks come on: only the no dropping the look keeps it from going.
    act(() => store.setConsent(false));
    act(() => store.setConsent(true));
    act(() => push({ killCloud: false, pauseUnknown: undefined }));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(m.cloud.generate).not.toHaveBeenCalled();
    expect(screen.queryByTestId("second-look")).toBeNull();
  });
  it("sends no look for a read that started before a no, even after a yes again", async () => {
    const { models, push, store } = setup({ killCloud: true, pauseUnknown: true }, "available");
    const m = Object.values(models)[0]!;
    let finish!: (v: { text: string; source: "on_device" }) => void;
    m.device.generate.mockImplementation(() => new Promise((r) => { finish = r; }));
    await addPhoto();
    await waitFor(() => expect(m.device.generate).toHaveBeenCalled());
    act(() => store.setConsent(false));
    act(() => store.setConsent(true));
    await act(async () => { finish({ text: JSON.stringify(phoneOnDevice), source: "on_device" }); });
    await screen.findByText("Read on this laptop");
    act(() => push({ killCloud: false, pauseUnknown: undefined }));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(m.cloud.generate).not.toHaveBeenCalled();
  });
  it("sends a waiting look to the model named in the same update that turns cloud checks on", async () => {
    const { models, push } = setup({ killCloud: true, pauseUnknown: true }, "available");
    const old = deviceReadsPhone(models);
    await addPhoto();
    await screen.findByText("Read on this laptop");
    act(() => push({ killCloud: false, pauseUnknown: undefined, cloudModelItem: "gemini-3.8-flash" }));
    await screen.findByTestId("second-look");
    expect(old.cloud.generate).not.toHaveBeenCalled();
    expect(models["gemini-3.8-flash"]?.cloud.generate).toHaveBeenCalledTimes(1);
  });
  // Another tab's no, then yes, that this tab has not heard yet (its storage events wait): a look whose read began
  // before that no must not go when this tab reconnects or cloud checks come on.
  it("sends no look after another tab's no and yes that this tab has not heard about yet", async () => {
    for (const hold of ["offline", "settings"] as const) {
      localStorage.clear();
      const here = deviceConsent(localStorage);
      const { models, push, rerender } = setup(hold === "settings" ? { killCloud: true, pauseUnknown: true } : {}, "available", {}, here);
      const m = deviceReadsPhone(models);
      if (hold === "offline") rerender({ online: false });
      await addPhoto();
      await screen.findByText("Read on this laptop");
      const otherTab = deviceConsent(localStorage);
      otherTab.set(false);
      otherTab.set(true);
      if (hold === "offline") rerender({ online: true });
      else act(() => push({ killCloud: false, pauseUnknown: undefined }));
      await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
      expect(m.cloud.generate, hold).not.toHaveBeenCalled();
      cleanup();
    }
  });
  it("drops a waiting look when the second-look policy in force no longer asks for one", async () => {
    const { models, push } = setup({ killCloud: true, pauseUnknown: true }, "available");
    const m = deviceReadsPhone(models);
    await addPhoto();
    await screen.findByText("Read on this laptop");
    act(() => push({ killCloud: false, pauseUnknown: undefined,
      secondLook: { whMismatch: false, batteryNumbers: false, notSure: false, hazardNoLabel: false, identity: false } }));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(m.cloud.generate).not.toHaveBeenCalled();
  });
  it("keeps a waiting look through being offline, and runs it once back online", async () => {
    const { models, push, rerender } = setup({ killCloud: true, pauseUnknown: true }, "available");
    const m = deviceReadsPhone(models);
    await addPhoto();
    await screen.findByText("Read on this laptop");
    rerender({ online: false });
    act(() => push({ killCloud: false, pauseUnknown: undefined }));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(m.cloud.generate).not.toHaveBeenCalled();
    rerender({ online: true });
    await screen.findByTestId("second-look");
    expect(m.cloud.generate).toHaveBeenCalledTimes(1);
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
