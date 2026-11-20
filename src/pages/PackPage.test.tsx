import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ed } from "../../tests/engine/helpers";
import type { ItemModels, ModelPort, ModelReply } from "../ai/port";
import { noPersistence, type LoadResult } from "../data/boxOps";
import { createBoxStore } from "../data/boxStore";
import type { ItemRead } from "../shared/itemRead";
import { PackPage, type PackPageProps } from "./PackPage";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../../eval/set/manifest.json";
import { deviceConsent } from "../data/deviceConsent";

const liquidLotionLabelRead: ItemRead = {
  itemName: "Body lotion", category: "lotion_cream", labelText: "SHEA BODY LOTION 8 FL OZ", volts: 0, milliampHours: 0, wattHours: 0,
  lithiumGrams: 0, batteryWords: false, liquid: true, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false,
  glassContainer: false, powder: false, retailBox: "cannot_tell", evidence: "label_read",
};
const port = (source: "on_device" | "in_cloud"): ModelPort & { generate: ReturnType<typeof vi.fn> } =>
  ({ generate: vi.fn(async () => ({ text: JSON.stringify(liquidLotionLabelRead), source })) });
const spyModels = () => ({ device: port("on_device"), hybrid: port("on_device"), cloud: port("in_cloud") }) satisfies ItemModels;
const persistence = () => noPersistence();
let n = 0;
const newStore = () => createBoxStore({ edition: () => ed, persistence: persistence(), now: () => 1000, today: () => "2026-11-20", newId: () => `id-${n++}` });
const okCamera = async () => ({ stream: { getTracks: () => [] } as unknown as MediaStream, stop: () => {} });
const index = [{ code: "CA", name: "Canada", immUrl: "https://pe.usps.com/text/imm/ce_003.htm" }, { code: "PH", name: "Philippines", immUrl: "https://pe.usps.com/text/imm/ps_006.htm" }];
const photo = new File(["x"], "lotion.jpg", { type: "image/jpeg" });
// Adds a photo and presses "Check this part" on the crop step, as a sender does.
const addPhoto = async () => {
  await userEvent.upload(screen.getByTestId("upload-input"), photo);
  const send = await screen.findByRole("button", { name: "Check this part" });
  await waitFor(() => expect(send).toBeEnabled());
  await userEvent.click(send);
};

// The tracked sample photo's own bytes, as the page would fetch them.
const sampleBytes = readFileSync(join(process.cwd(), "public", manifest.items.find((i) => i.itemId === "own-18")!.photo));
const loadSample = async () => sampleBytes.buffer.slice(sampleBytes.byteOffset, sampleBytes.byteOffset + sampleBytes.byteLength);
// Presses "Try a sample photo", then "Check this part" on the crop step, as a judge with no camera does.
const trySample = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Try a sample photo" }));
  await screen.findByTestId("sample-note");
  const send = await screen.findByRole("button", { name: "Check this part" });
  await waitFor(() => expect(send).toBeEnabled());
  await userEvent.click(send);
};

function setup(over: Partial<PackPageProps> = {}, consent: boolean | null = true) {
  const store = over.store ?? newStore();
  if (consent !== null) store.setConsent(consent);
  const models = (over.models as ReturnType<typeof spyModels> | undefined) ?? spyModels();
  render(<PackPage store={store} models={models} gate="no_api" config={{ killCloud: false }} openCamera={okCamera} index={index}
    saveCrop={async () => {}} online {...over} />);
  return { store, models };
}

describe("PackPage", () => {
  beforeAll(() => { vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined); });
  beforeEach(() => {
    // A decodable stand-in for the picked photo.
    vi.stubGlobal("createImageBitmap", vi.fn(async () => { const c = document.createElement("canvas"); c.width = 640; c.height = 480; return c; }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("says what it is for in one line, and points judges at the sample box", () => {
    setup();
    expect(screen.getByRole("heading", { level: 1, name: "Check a box before you tape it" })).toBeInTheDocument();
    expect(screen.getByTestId("purpose")).toHaveTextContent("Show each item, and see if it may go in the box to the country you pick.");
    expect(screen.getByRole("link", { name: "Judges: start here" })).toHaveAttribute("href", "/judge");
  });

  it("re-judges the box when the sender changes how many, across the lithium limit and back, and removes an item", async () => {
    const { store } = setup();
    await store.ready;
    const laptop: ItemRead = { ...liquidLotionLabelRead, itemName: "Laptop", category: "laptop", labelText: "11.55V 4380mAh 50.6Wh", liquid: false,
      volts: 11.55, milliampHours: 4380, wattHours: 50.6, batteryWords: true };
    act(() => { const id = store.addManual(laptop); store.answer(id, "device_condition", "new_sealed"); });
    const card = await screen.findByTestId("item-card");
    expect(within(card).getByTestId("verdict-chip")).toHaveTextContent("OK to pack");
    const howMany = within(card).getByLabelText("How many");
    await userEvent.clear(howMany);
    await userEvent.type(howMany, "3");
    await userEvent.tab();
    await waitFor(() => expect(within(screen.getByTestId("item-card")).getByTestId("verdict-chip")).toHaveTextContent("Take it out"));
    expect(screen.getByTestId("box-summary")).toHaveTextContent("1 to take out");
    await userEvent.clear(within(screen.getByTestId("item-card")).getByLabelText("How many"));
    await userEvent.type(within(screen.getByTestId("item-card")).getByLabelText("How many"), "1");
    await userEvent.tab();
    await waitFor(() => expect(within(screen.getByTestId("item-card")).getByTestId("verdict-chip")).toHaveTextContent("OK to pack"));
    await userEvent.click(within(screen.getByTestId("item-card")).getByRole("button", { name: /^Remove / }));
    expect(screen.queryByTestId("item-card")).toBeNull();
    expect(store.getState().items).toHaveLength(0);
  });

  it("ends a read that takes too long with a plain notice, and drops its reply if it comes later", async () => {
    let answer: (v: ModelReply) => void = () => {};
    const hung: ModelPort & { generate: ReturnType<typeof vi.fn> } = { generate: vi.fn((): Promise<ModelReply> => new Promise((r) => { answer = r; })) };
    const { store } = setup({ models: { ...spyModels(), cloud: hung }, readTimeoutMs: 50 });
    await addPhoto();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The check took too long. Try again or type the item."));
    expect(hung.generate).toHaveBeenCalledTimes(1);
    expect((hung.generate.mock.calls[0]![2] as { signal?: AbortSignal }).signal?.aborted).toBe(true);
    await act(async () => { answer({ text: JSON.stringify(liquidLotionLabelRead), source: "in_cloud" }); await Promise.resolve(); });
    expect(store.getState().items).toEqual([]);
    expect(screen.queryByTestId("item-card")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("The check took too long. Try again or type the item.");
  });

  it("makes no model call when the cloud is paused", async () => {
    const { models } = setup({ config: { killCloud: true }, gate: "available" });
    await addPhoto();
    await waitFor(() => expect(screen.getByTestId("paused-banner")).toHaveTextContent("Cloud checks are paused. Checks on this laptop still work."));
    expect(models.cloud.generate).not.toHaveBeenCalled();
    expect(models.hybrid.generate).not.toHaveBeenCalled();
  });

  it("says when a newer rule edition could not be used", () => {
    setup({ editionNotice: "A newer rule edition failed its integrity check. Using the built-in edition." });
    expect(screen.getByTestId("edition-notice")).toHaveTextContent("A newer rule edition failed its integrity check. Using the built-in edition.");
  });

  it("shows the suspended banner, with the date the suspension list was checked", () => {
    const store = newStore();
    store.setDestination("HT");
    setup({ store });
    expect(screen.getByTestId("suspended-banner")).toHaveTextContent("Mail service to Haiti is suspended.");
    expect(screen.getByTestId("suspended-banner")).toHaveTextContent(`Post office suspension list checked ${ed.suspensions.checkedOn}`);
  });

  it("says ahead of time when the post office will stop taking mail to the destination, and suspends it from that day", () => {
    // The bundled edition: USPS announced Canada's suspension from 2026-11-29; the page's date is 2026-11-20.
    const store = newStore();
    store.setDestination("CA");
    setup({ store });
    expect(screen.getByTestId("suspension-ahead-banner")).toHaveTextContent("The post office stops taking mail to Canada on November 29, 2026. Mail this box before then.");
    expect(screen.queryByTestId("suspended-banner")).toBeNull();
    cleanup();
    const later = createBoxStore({ edition: () => ed, persistence: persistence(), now: () => 1000, today: () => "2026-11-29", newId: () => `id-${n++}` });
    later.setDestination("CA");
    setup({ store: later });
    expect(screen.getByTestId("suspended-banner")).toHaveTextContent("Mail service to Canada is suspended.");
    expect(screen.queryByTestId("suspension-ahead-banner")).toBeNull();
  });

  it("says when the post office suspension list was checked, next to the destination", () => {
    setup();
    expect(screen.getByTestId("suspension-checked")).toHaveTextContent(`Post office suspension list checked ${ed.suspensions.checkedOn}`);
  });

  it("asks for consent before any cloud call and remembers the answer", async () => {
    const { store } = setup({}, null);
    expect(screen.getByText(/a cropped photo of the item and the words on its label go to Google's Gemini/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(store.getState().cloudConsent).toBe(true);
    expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
  });

  it("reads an added photo in the cloud and shows its verdict, then re-checks a country change with no model call", async () => {
    const { models } = setup();
    await addPhoto();
    const card = await screen.findByTestId("item-card");
    // A new box starts in the Philippines, where liquid lotion is out; Canada takes it.
    expect(within(card).getByTestId("verdict-chip")).toHaveTextContent("Take it out");
    expect(within(card).getByTestId("source-glyph")).toHaveAccessibleName("Read in the cloud");
    expect(within(card).getByTestId("crop-image")).toHaveAttribute("src", expect.stringMatching(/^data:image\/jpeg/));
    expect(models.cloud.generate).toHaveBeenCalledTimes(1);
    await userEvent.selectOptions(screen.getByTestId("destination-picker"), "CA");
    expect(within(screen.getByTestId("item-card")).getByTestId("verdict-chip")).toHaveTextContent("OK to pack");
    expect(screen.getByTestId("recheck-line")).toHaveTextContent("0 model calls");
    expect(models.cloud.generate).toHaveBeenCalledTimes(1);
  });

  it("drops an added photo that shows no item, with a hint, and adds no card", async () => {
    const nothing: ItemRead = { ...liquidLotionLabelRead, itemName: "unknown", category: "other", labelText: "", liquid: false, evidence: "not_sure" };
    const cloud = { generate: vi.fn(async () => ({ text: JSON.stringify(nothing), source: "in_cloud" as const })) };
    const { store } = setup({ models: { ...spyModels(), cloud } });
    await addPhoto();
    expect(await screen.findByRole("alert")).toHaveTextContent("Nothing to check there. Hold one item inside the box.");
    expect(screen.queryByTestId("item-card")).toBeNull();
    expect(store.getState().items).toHaveLength(0);
  });

  it("makes no further cloud call once cloud checks are switched off during a read, not even a retry", async () => {
    const store = newStore();
    store.setConsent(true);
    let fail: (e: Error) => void = () => {};
    const cloud = { generate: vi.fn(() => new Promise<never>((_r, reject) => { fail = reject; })) };
    const fallback = { generate: vi.fn(async () => ({ text: JSON.stringify(liquidLotionLabelRead), source: "in_cloud" as const })) };
    const models = { ...spyModels(), cloud, fallback };
    const props = { store, models, gate: "no_api" as const, openCamera: okCamera, index, saveCrop: async () => {}, online: true };
    const { rerender } = render(<PackPage {...props} config={{ killCloud: false }} />);
    await addPhoto();
    await waitFor(() => expect(cloud.generate).toHaveBeenCalledTimes(1));
    rerender(<PackPage {...props} config={{ killCloud: true }} />);
    await act(async () => { fail(new Error("fetch-error 503")); await Promise.resolve(); });
    await waitFor(() => expect(screen.queryByTestId("item-card")).toBeNull());
    expect(cloud.generate).toHaveBeenCalledTimes(1);
    expect(fallback.generate).not.toHaveBeenCalled();
  });

  it("aborts a cloud read in flight the moment the sender takes back consent, before the page re-renders", async () => {
    let signal: AbortSignal | undefined;
    const cloud = { generate: vi.fn((_p: string, _i?: unknown, o?: { signal?: AbortSignal }) => { signal = o?.signal; return new Promise<never>(() => {}); }) };
    const { store } = setup({ models: { ...spyModels(), cloud } });
    await addPhoto();
    await waitFor(() => expect(cloud.generate).toHaveBeenCalledTimes(1));
    expect(signal?.aborted).toBe(false);
    // Subscribed after the page, so it sees the state at the moment the change is announced.
    let abortedWhenAnnounced: boolean | undefined;
    store.subscribe(() => { abortedWhenAnnounced = signal?.aborted; });
    act(() => store.setConsent(false));
    expect(abortedWhenAnnounced).toBe(true);
  });

  it("takes the pause from Remote Config as it is now, not from the last render, before using the cloud", async () => {
    // Remote Config has the pause on; the page has not re-rendered, so its props still say it is off.
    for (const paused of [true, false]) {
      const liveConfig = { get: () => ({ killCloud: paused }), subscribe: () => () => {} };
      const { models } = setup({ liveConfig });
      await addPhoto();
      await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
      expect(models.cloud.generate).toHaveBeenCalledTimes(paused ? 0 : 1);
      expect(models.hybrid.generate).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it("aborts a cloud read in flight when the sender leaves the page, and adds nothing once the page is gone", async () => {
    let signal: AbortSignal | undefined;
    let finish!: (r: { text: string; source: "in_cloud" }) => void;
    const cloud = { generate: vi.fn((_p: string, _i?: unknown, o?: { signal?: AbortSignal }) => { signal = o?.signal; return new Promise<{ text: string; source: "in_cloud" }>((r) => { finish = r; }); }) };
    const store = newStore();
    store.setConsent(true);
    const saveCrop = vi.fn(async () => {});
    const { unmount } = render(<PackPage store={store} models={{ ...spyModels(), cloud }} gate="no_api" config={{ killCloud: false }} openCamera={okCamera} index={index} saveCrop={saveCrop} online />);
    await addPhoto();
    await waitFor(() => expect(cloud.generate).toHaveBeenCalledTimes(1));
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => { finish({ text: JSON.stringify(liquidLotionLabelRead), source: "in_cloud" }); for (let i = 0; i < 10; i++) await Promise.resolve(); });
    expect(store.getState().items).toHaveLength(0);
    expect(saveCrop).not.toHaveBeenCalled();
  });

  it("reads nothing in the cloud when this device's stored answer says no, before the page has heard of it", async () => {
    // Another tab on this device took consent back; its storage event has not reached this page yet.
    localStorage.clear();
    const store = createBoxStore({ edition: () => ed, persistence: persistence(), now: () => 1000, today: () => "2026-11-20", newId: () => `id-${n++}`, consent: deviceConsent(localStorage) });
    const { models } = setup({ store });
    expect(store.getState().cloudConsent).toBe(true);
    localStorage.setItem("byt.cloudConsent", "false");
    await addPhoto();
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(models.cloud.generate).not.toHaveBeenCalled();
    expect(models.hybrid.generate).not.toHaveBeenCalled();
    localStorage.clear();
  });

  it("offers a sample photo that waits for the cloud choice like any photo, and makes no model call before it", async () => {
    const { models } = setup({ loadSample }, null);
    await trySample();
    expect(screen.getByTestId("sample-sent")).toHaveTextContent("The last check used a sample photo from our test set, not your item.");
    expect(screen.getByRole("button", { name: "Allow" })).toBeInTheDocument();
    expect(models.cloud.generate).not.toHaveBeenCalled();
    expect(models.hybrid.generate).not.toHaveBeenCalled();
    expect(models.device.generate).not.toHaveBeenCalled();
    expect(screen.queryByTestId("item-card")).toBeNull();
  });

  it("reads the sample photo on this laptop only, with cloud checks off, and never sends it to the cloud", async () => {
    const { models } = setup({ loadSample, gate: "available" }, false);
    await trySample();
    const card = await screen.findByTestId("item-card");
    expect(within(card).getByTestId("source-glyph")).toHaveAccessibleName("Read on this laptop");
    expect(models.cloud.generate).not.toHaveBeenCalled();
    expect(models.hybrid.generate).not.toHaveBeenCalled();
    expect(models.device.generate).toHaveBeenCalledTimes(1);
  });

  it("reads the sample photo in the cloud after Allow when this laptop has no model of its own", async () => {
    const { models } = setup({ loadSample, gate: "no_api" }, null);
    await userEvent.click(screen.getByRole("button", { name: "Allow" }));
    await trySample();
    const card = await screen.findByTestId("item-card");
    expect(within(card).getByTestId("source-glyph")).toHaveAccessibleName("Read in the cloud");
    expect(models.cloud.generate).toHaveBeenCalledTimes(1);
  });

  describe("a press before the page knows whether this laptop has its own model", () => {
    const page = (store: ReturnType<typeof newStore>, models: ReturnType<typeof spyModels>, gate: PackPageProps["gate"], settingsWaitMs = 10_000,
      online = true, config: PackPageProps["config"] = { killCloud: false }) => (
      <PackPage store={store} models={models} gate={gate} config={config} openCamera={okCamera} index={index}
        saveCrop={async () => {}} online={online} loadSample={loadSample} settingsWaitMs={settingsWaitMs} />
    );

    it("drops the press when the cloud choice changes while it waits, and says so", async () => {
      const store = newStore();
      store.setConsent(true);
      const models = spyModels();
      const view = render(page(store, models, "checking"));
      await trySample();
      await screen.findByTestId("getting-ready");
      act(() => { store.setConsent(false); store.setConsent(true); });
      view.rerender(page(store, models, "no_api"));
      expect(await screen.findByRole("alert")).toHaveTextContent("Your cloud choice changed while this laptop was getting ready. Add the photo again.");
      expect(models.cloud.generate).not.toHaveBeenCalled();
      expect(models.hybrid.generate).not.toHaveBeenCalled();
      expect(models.device.generate).not.toHaveBeenCalled();
    });

    it("decides with the connection as it is after the wait, not as it was at the press", async () => {
      const store = newStore();
      store.setConsent(true);
      const models = spyModels();
      const view = render(page(store, models, "checking", 10_000, false));
      await trySample();
      await screen.findByTestId("getting-ready");
      view.rerender(page(store, models, "checking", 10_000, true));
      view.rerender(page(store, models, "no_api", 10_000, true));
      const card = await screen.findByTestId("item-card");
      expect(within(card).getByTestId("source-glyph")).toHaveAccessibleName("Read in the cloud");
      expect(models.cloud.generate).toHaveBeenCalledTimes(1);
    });

    it("never lets an older press's failure cover a newer press's notice", async () => {
      const store = newStore();
      store.setConsent(false);
      const models = spyModels();
      const nothing: ItemRead = { ...liquidLotionLabelRead, itemName: "", category: "other", labelText: "", liquid: false, evidence: "not_sure" };
      let call = 0;
      models.device.generate.mockImplementation(async () => {
        call++;
        if (call === 1) { await new Promise((r) => setTimeout(r, 60)); throw new Error("the model failed"); }
        return { text: JSON.stringify(nothing), source: "on_device" };
      });
      const view = render(page(store, models, "checking"));
      await trySample();
      await trySample();
      view.rerender(page(store, models, "available"));
      expect(await screen.findByRole("alert")).toHaveTextContent("Nothing to check there. Hold one item inside the box.");
      await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
      expect(screen.getByRole("alert")).toHaveTextContent("Nothing to check there. Hold one item inside the box.");
      expect(call).toBe(2);
    });

    it("says nothing about checks on this laptop while it is not known whether it has a model", () => {
      render(page(newStore(), spyModels(), "checking", 10_000, true, { killCloud: true }));
      expect(screen.getByTestId("paused-banner")).toHaveTextContent("Cloud checks are paused.");
      expect(screen.getByTestId("paused-banner")).not.toHaveTextContent("still work");
    });

    it("says so plainly, with cloud checks on, when the check does not finish in time, and reads nothing", async () => {
      const store = newStore();
      store.setConsent(true);
      const models = spyModels();
      render(page(store, models, "checking", 50));
      await trySample();
      expect(await screen.findByRole("alert")).toHaveTextContent("This laptop is still checking whether it can read photos itself.");
      expect(models.cloud.generate).not.toHaveBeenCalled();
      expect(models.hybrid.generate).not.toHaveBeenCalled();
    });

    it("waits, then reads on this laptop when it has a model and cloud checks are off", async () => {
      const store = newStore();
      store.setConsent(false);
      const models = spyModels();
      const view = render(page(store, models, "checking"));
      // While it checks, nothing on the page says this laptop cannot read photos.
      expect(screen.getByTestId("cloud-choice")).toHaveTextContent("Cloud checks are off.");
      expect(screen.getByTestId("cloud-choice")).not.toHaveTextContent("can't read photos");
      await trySample();
      expect(await screen.findByTestId("getting-ready")).toHaveTextContent("Getting ready to check. One moment.");
      expect(models.device.generate).not.toHaveBeenCalled();
      view.rerender(page(store, models, "available"));
      const card = await screen.findByTestId("item-card");
      expect(within(card).getByTestId("source-glyph")).toHaveAccessibleName("Read on this laptop");
      expect(models.device.generate).toHaveBeenCalledTimes(1);
      expect(models.cloud.generate).not.toHaveBeenCalled();
      expect(models.hybrid.generate).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("waits, then uses this laptop first when cloud checks are on, never the cloud-only route", async () => {
      const store = newStore();
      store.setConsent(true);
      const models = spyModels();
      const view = render(page(store, models, "checking"));
      await trySample();
      expect(await screen.findByTestId("getting-ready")).toBeInTheDocument();
      view.rerender(page(store, models, "available"));
      await screen.findByTestId("item-card");
      expect(models.hybrid.generate).toHaveBeenCalledTimes(1);
      expect(models.cloud.generate).not.toHaveBeenCalled();
    });

    it("says so plainly when the check does not finish in time, and reads nothing", async () => {
      const store = newStore();
      store.setConsent(false);
      const models = spyModels();
      render(page(store, models, "checking", 50));
      await trySample();
      expect(await screen.findByRole("alert")).toHaveTextContent("This laptop is still checking whether it can read photos itself. Try again in a moment, or type the item.");
      expect(models.device.generate).not.toHaveBeenCalled();
      expect(models.cloud.generate).not.toHaveBeenCalled();
      expect(screen.queryByTestId("item-card")).toBeNull();
    });
  });

  it("says photos and label text stay on this laptop when cloud checks are off and it reads on its own", () => {
    setup({ gate: "available" }, false);
    expect(screen.getByTestId("cloud-choice")).toHaveTextContent("Cloud checks are off. Photos and label text stay on this laptop.");
  });

  it("lets the sender take back cloud consent, and asks again before turning it on", async () => {
    const { store, models } = setup({}, null);
    await userEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(screen.getByTestId("cloud-choice")).toHaveTextContent("Cloud checks are on.");
    await userEvent.click(screen.getByRole("button", { name: "Turn off cloud checks" }));
    expect(store.getState().cloudConsent).toBe(false);
    // One state line: this laptop has no model of its own, so the cloud line says what that means.
    expect(screen.getByTestId("cloud-choice")).toHaveTextContent("Cloud checks are off, and this laptop can't read photos on its own. Type items, or turn on cloud checks.");
    expect(screen.queryByText("This device checks items in the cloud.")).toBeNull();
    await addPhoto();
    expect(models.cloud.generate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Turn on cloud checks" }));
    expect(store.getState().cloudConsent).toBeNull();
    expect(screen.getByRole("button", { name: "Allow" })).toBeInTheDocument();
  });

  it("puts the newest item's verdict in a sheet, linked to its card, and announces it", async () => {
    setup();
    expect(screen.queryByTestId("newest-sheet")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Type an item" }));
    await userEvent.selectOptions(screen.getByLabelText("What is it?"), "clothing");
    await userEvent.type(screen.getByLabelText("Name (optional)"), "Wool scarf");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    const sheet = await screen.findByTestId("newest-sheet");
    expect(sheet).toHaveAttribute("role", "status");
    expect(within(sheet).getByText("Wool scarf")).toBeInTheDocument();
    expect(within(sheet).getByTestId("verdict-chip")).toHaveTextContent("OK to pack");
    const card = screen.getAllByTestId("item-card").at(-1)!;
    expect(within(sheet).getByRole("link", { name: "See the card" })).toHaveAttribute("href", `#${card.id}`);
  });

  it("shows no alert before the sender has done anything", async () => {
    setup({}, null);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("asks for the cloud choice when nothing can read the photo yet, and clears that once the sender allows", async () => {
    const { models } = setup({}, null);
    await addPhoto();
    expect(await screen.findByRole("alert")).toHaveTextContent("This laptop can't read photos on its own. Allow cloud checks above, or type the item.");
    expect(models.cloud.generate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says why nothing can read the photo while offline, and clears it once back online", async () => {
    const store = newStore();
    store.setConsent(true);
    const models = spyModels();
    const props = { store, models, gate: "no_api" as const, config: { killCloud: false }, openCamera: okCamera, index, saveCrop: async () => {} };
    const { rerender } = render(<PackPage {...props} online={false} />);
    await addPhoto();
    expect(await screen.findByRole("alert")).toHaveTextContent("You're offline, and this laptop can't read photos on its own. Type the item, or try again when you're back online.");
    rerender(<PackPage {...props} online />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says what to do when nothing can read the photo", async () => {
    const { models } = setup({}, false);
    await addPhoto();
    expect(await screen.findByRole("alert")).toHaveTextContent("This device can't read photos on its own, and cloud checks are off. Type the item instead.");
    expect(models.cloud.generate).not.toHaveBeenCalled();
  });

  it("adds a typed item with no model call, and judges it", async () => {
    // Canada, where a liquid lotion is OK to pack.
    const store = newStore();
    store.setDestination("CA");
    const { models } = setup({ store });
    await userEvent.click(screen.getByRole("button", { name: "Type an item" }));
    const form = screen.getByTestId("add-by-hand");
    await userEvent.selectOptions(within(form).getByLabelText("What is it?"), "lotion_cream");
    await userEvent.click(within(form).getByLabelText("It is a liquid"));
    await userEvent.click(within(form).getByRole("button", { name: "Add" }));
    const card = await screen.findByTestId("item-card");
    expect(within(card).getByTestId("source-glyph")).toHaveAccessibleName("Typed by you");
    expect(within(card).getByTestId("verdict-chip")).toHaveTextContent("OK to pack");
    expect(models.cloud.generate).not.toHaveBeenCalled();
    expect(models.hybrid.generate).not.toHaveBeenCalled();
  });

  it("applies a fixed reading to the verdict", async () => {
    // Canada, where a body lotion is OK to pack until its label says flammable.
    const canada = newStore();
    canada.setDestination("CA");
    const { store } = setup({ store: canada });
    await userEvent.click(screen.getByRole("button", { name: "Type an item" }));
    const form = screen.getByTestId("add-by-hand");
    await userEvent.selectOptions(within(form).getByLabelText("What is it?"), "lotion_cream");
    await userEvent.click(within(form).getByRole("button", { name: "Add" }));
    const card = await screen.findByTestId("item-card");
    expect(within(card).getByTestId("verdict-chip")).toHaveTextContent("OK to pack");
    const fix = within(card).getByTestId("fix-reading");
    await userEvent.click(within(fix).getByLabelText("The label says flammable"));
    await userEvent.click(within(fix).getByRole("button", { name: "Save" }));
    expect(store.getState().items[0]?.overrides).toEqual({ flammableOnLabel: true });
    expect(within(screen.getByTestId("item-card")).getByTestId("verdict-chip")).toHaveTextContent("Take it out");
  });

  it("shows no country while the box loads, and offers to read a box again whose read failed", async () => {
    let answer: (r: LoadResult) => void = () => {};
    const loadBox = vi.fn(() => new Promise<LoadResult>((r) => { answer = r; }));
    const store = createBoxStore({ edition: () => ed, persistence: { ...noPersistence(), loadBox }, now: () => 1000, today: () => "2026-11-20", newId: () => `id-${n++}` });
    setup({ store });
    expect(screen.getByTestId("destination-picker")).toHaveValue("");
    await act(async () => { answer({ status: "failed", error: "offline" }); await store.ready; });
    expect(screen.getByRole("alert")).toHaveTextContent("Your saved box could not be opened. New items stay on this device until it opens.");
    loadBox.mockResolvedValueOnce({ status: "found", box: { destinationCode: "PH", items: [] } });
    await userEvent.click(screen.getByRole("button", { name: "Try opening it again" }));
    await waitFor(() => expect(screen.getByTestId("destination-picker")).toHaveValue("PH"));
    expect(screen.queryByText("Your saved box could not be opened. New items stay on this device until it opens.")).toBeNull();
  });

  it("says a removal is not saved yet when its delete fails, and offers to save again", async () => {
    const ops = { ...noPersistence(), deleteItem: vi.fn<(boxId: string, itemId: string) => Promise<void>>(async () => { throw new Error("offline"); }) };
    const store = createBoxStore({ edition: () => ed, persistence: ops, now: () => 1000, today: () => "2026-11-20", newId: () => `id-${n++}` });
    setup({ store });
    await store.ready;
    act(() => { store.addManual({ ...liquidLotionLabelRead, itemName: "Lotion" }); });
    await store.settled();
    await userEvent.click(await screen.findByRole("button", { name: "Remove Lotion" }));
    await store.settled();
    expect(await screen.findByTestId("removal-unsaved")).toHaveTextContent("A removal is not saved yet.");
    ops.deleteItem.mockResolvedValue(undefined);
    await userEvent.click(within(screen.getByTestId("removal-unsaved")).getByRole("button", { name: "Try saving again" }));
    await store.settled();
    await waitFor(() => expect(screen.queryByTestId("removal-unsaved")).toBeNull());
  });

  it("moves focus to the next card after a removal, then to the box, and says what was removed", async () => {
    const { store } = setup();
    await store.ready;
    act(() => { store.addManual({ ...liquidLotionLabelRead, itemName: "Lotion A" }); store.addManual({ ...liquidLotionLabelRead, itemName: "Lotion B" }); });
    await userEvent.click(await screen.findByRole("button", { name: "Remove Lotion A" }));
    await waitFor(() => expect(screen.getByTestId("removal-notice")).toHaveTextContent("Removed Lotion A."));
    expect(document.activeElement).toBe(screen.getByRole("article", { name: "Lotion B" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove Lotion B" }));
    await waitFor(() => expect(screen.getByTestId("removal-notice")).toHaveTextContent("Removed Lotion B."));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Your box" }));
  });
});
