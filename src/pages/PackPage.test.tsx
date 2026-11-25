import { draftKey } from "../data/typedDrafts";
import { draftOf } from "../ui/ReadFields";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ed } from "../../tests/engine/helpers";
import type { ItemModels, ModelPort, ModelReply } from "../ai/port";
import { noPersistence, type BoxMeta, type LoadResult } from "../data/boxOps";
import { createBoxStore } from "../data/boxStore";
import type { ItemRead } from "../shared/itemRead";
import { MASKED_SAMPLE } from "../judge/judgePhotos";
import { PackPage, type PackPageProps } from "./PackPage";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
const newStore = () => createBoxStore({ edition: () => ed, persistence: persistence(), now: () => 1000, today: () => "2026-11-25", newId: () => `id-${n++}` });
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

// The sample photo's own bytes, as the page would fetch them: the lotion with its brand blurred.
const sampleBytes = readFileSync(join(process.cwd(), "public", MASKED_SAMPLE.url));
const loadSample = async () => sampleBytes.buffer.slice(sampleBytes.byteOffset, sampleBytes.byteOffset + sampleBytes.byteLength);
// Presses "Try a sample photo", then "Check this part" on the crop step, as a judge with no camera does.
// With a recorded read, the sample goes straight to it; with none, it takes the crop step like any photo.
const tryRecordedSample = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Try a sample photo" }));
  await screen.findByTestId("sample-sent");
};
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
    saveCrop={async () => {}} deleteCrop={async () => {}} online {...over} />);
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
    // A typed item's numbers are the sender's own, so the Wh rules judge them: one laptop is OK to pack.
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

  it("asks for the Wh printed on the label of a held photo read, and judges the item on the sender's number", async () => {
    const { store } = setup();
    await store.ready;
    const phone: ItemRead = { ...liquidLotionLabelRead, itemName: "Phone", category: "phone", labelText: "3.85V 4000mAh 15.4Wh", liquid: false,
      volts: 3.85, milliampHours: 4000, wattHours: 15.4, batteryWords: true, retailBox: "sealed" };
    act(() => {
      store.setDestination("CA");
      const id = store.addRead({ read: phone, source: "on_device", ms: 1200, route: "device_only", recoveredFrom: null }, "k");
      store.answer(id, "device_condition", "new_sealed");
      store.answer(id, "cell_count", "one");
    });
    const card = await screen.findByTestId("item-card");
    expect(within(card).getByTestId("verdict-chip")).toHaveTextContent("Check this");
    await userEvent.type(within(card).getByLabelText("Type the Wh printed on the label"), "15.4");
    await userEvent.click(within(card).getByRole("button", { name: "Check the number" }));
    await waitFor(() => expect(within(screen.getByTestId("item-card")).getByTestId("verdict-chip")).toHaveTextContent("OK to pack"));
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
    await waitFor(() => expect(screen.getByTestId("paused-banner")).toHaveTextContent("Cloud checks are paused. Checks on this device still work."));
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

  it("opens the typed item form after a reload when an item was still being typed", () => {
    try {
      const store = newStore();
      sessionStorage.setItem(draftKey(store.getState().boxId), JSON.stringify({ ...draftOf(null), category: "lotion_cream", itemName: "Shea lotion" }));
      setup({ store });
      expect(screen.getByRole("button", { name: "Type an item" })).toHaveAttribute("aria-expanded", "true");
      expect(within(screen.getByTestId("add-by-hand")).getByLabelText("Name (optional)")).toHaveValue("Shea lotion");
    } finally {
      sessionStorage.clear();
    }
  });

  const holiday = { service: "Priority Mail International", sendBy: "2026-12-09", deliverBy: "2026-12-25", sourceUrl: "https://www.usps.com/holiday/holiday-shipping-dates.htm", checkedOn: "2026-11-21" };

  it("says how many days are left to mail by the USPS holiday date, with its page", () => {
    setup({ config: { killCloud: false, holidayDates: [holiday] }, today: "2026-11-25" });
    expect(screen.getByTestId("deadline-clock")).toHaveTextContent("USPS suggests mailing by December 9 for December 25 (Priority Mail International): 14 days left.");
    expect(screen.getByRole("link", { name: "USPS holiday dates" })).toHaveAttribute("href", holiday.sourceUrl);
  });

  it("shows no holiday clock for a country whose mail stops first, or with no dates", () => {
    const store = newStore();
    store.setDestination("CA");
    setup({ store, config: { killCloud: false, holidayDates: [holiday] }, today: "2026-11-25" });
    expect(screen.getByTestId("suspension-ahead-banner")).toBeInTheDocument();
    expect(screen.queryByTestId("deadline-clock")).toBeNull();
    cleanup();
    setup({ today: "2026-11-25" });
    expect(screen.queryByTestId("deadline-clock")).toBeNull();
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

  it("asks for cloud checks only when a photo needs them, then reads that photo and remembers the answer", async () => {
    const { store, models } = setup({}, null);
    // Nothing asks on arrival: the chip says cloud checks are off.
    expect(screen.queryByText(/goes to Google's Gemini/)).toBeNull();
    expect(screen.getByTestId("cloud-chip")).toHaveTextContent("Cloud: off");
    await addPhoto();
    expect(await screen.findByText(/the cropped photo goes to Google's Gemini/)).toBeInTheDocument();
    expect(models.cloud.generate).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    // The question takes focus, so a keyboard or screen reader user lands on it.
    expect(screen.getByRole("button", { name: "Allow" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(store.getState().cloudConsent).toBe(true);
    expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
    // The photo that asked goes on to its check.
    expect(await screen.findByTestId("item-card")).toBeInTheDocument();
    expect(models.cloud.generate).toHaveBeenCalledTimes(1);
  });

  it("closes a photo's cloud question when the choice changes in another tab, and sends nothing", async () => {
    const { store, models } = setup({}, null);
    await addPhoto();
    await screen.findByRole("button", { name: "Allow" });
    // Another tab answers; this page hears it through the store.
    act(() => store.setConsent(false));
    expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
    expect(await screen.findByRole("alert")).toHaveTextContent("Your cloud choice changed in another tab. Add the photo again.");
    expect(models.cloud.generate).not.toHaveBeenCalled();
  });

  it("sends nothing when Allow is pressed after another tab said no, even before this page has heard of it", async () => {
    localStorage.clear();
    const store = createBoxStore({ edition: () => ed, persistence: persistence(), now: () => 1000, today: () => "2026-11-25", newId: () => `id-${n++}`, consent: deviceConsent(localStorage) });
    const { models } = setup({ store }, null);
    await addPhoto();
    await screen.findByRole("button", { name: "Allow" });
    // The other tab's answer is stored; its storage event has not arrived.
    localStorage.setItem("byt.cloudConsent.v2", "false");
    await userEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(localStorage.getItem("byt.cloudConsent.v2")).toBe("false");
    expect(await screen.findByRole("alert")).toHaveTextContent("Your cloud choice changed in another tab. Add the photo again.");
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(models.cloud.generate).not.toHaveBeenCalled();
    localStorage.clear();
  });

  it("closes a cloud question when another tab turns cloud checks on and off again, though storage only shows the last", async () => {
    localStorage.clear();
    const store = createBoxStore({ edition: () => ed, persistence: persistence(), now: () => 1000, today: () => "2026-11-25", newId: () => `id-${n++}`, consent: deviceConsent(localStorage) });
    setup({ store }, false);
    await userEvent.click(screen.getByTestId("cloud-chip"));
    await screen.findByRole("button", { name: "Allow" });
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "byt.cloudConsent.v2", newValue: "true" }));
      window.dispatchEvent(new StorageEvent("storage", { key: "byt.cloudConsent.v2", newValue: "false" }));
    });
    expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
    localStorage.clear();
  });

  it("drops an older photo's cloud question when a newer photo is added, so Allow can only send the newest", async () => {
    const store = newStore();
    const models = spyModels();
    const ui = (online: boolean) => <PackPage store={store} models={models} gate="no_api" config={{ killCloud: false }} openCamera={okCamera} index={index}
      saveCrop={async () => {}} deleteCrop={async () => {}} online={online} />;
    const view = render(ui(true));
    await addPhoto();
    await screen.findByRole("button", { name: "Allow" });
    view.rerender(ui(false));
    await addPhoto();
    expect(await screen.findByRole("alert")).toHaveTextContent("You're offline");
    expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
    expect(models.cloud.generate).not.toHaveBeenCalled();
  });

  it("puts focus back on the cloud chip once the question is answered", async () => {
    setup({}, null);
    await userEvent.click(screen.getByTestId("cloud-chip"));
    await userEvent.keyboard("{Enter}");
    expect(screen.getByTestId("cloud-chip")).toHaveTextContent("Cloud: on");
    expect(screen.getByTestId("cloud-chip")).toHaveFocus();
  });

  it("asks for cloud checks when a photo comes before the cloud settings, rather than calling the cloud paused", async () => {
    // Remote Config has not answered yet, so cloud checks count as paused until it does.
    const { models } = setup({ config: { killCloud: true, pauseUnknown: true } }, null);
    await addPhoto();
    expect(await screen.findByRole("button", { name: "Allow" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(models.cloud.generate).not.toHaveBeenCalled();
  });

  it("does not ask while cloud checks are paused on purpose, and says so", async () => {
    const { models } = setup({ config: { killCloud: true } }, null);
    await addPhoto();
    expect(await screen.findByRole("alert")).toHaveTextContent("Cloud checks are paused");
    expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
    expect(models.cloud.generate).not.toHaveBeenCalled();
  });

  it("keeps a photo on this device when the sender says so at the ask, and says why it cannot be read", async () => {
    const { store, models } = setup({}, null);
    await addPhoto();
    await userEvent.click(await screen.findByRole("button", { name: "Check on this device only" }));
    expect(store.getState().cloudConsent).toBe(false);
    expect(await screen.findByRole("alert")).toHaveTextContent("This device can't read photos on its own, and cloud checks are off. Type the item instead.");
    expect(models.cloud.generate).not.toHaveBeenCalled();
    expect(screen.queryByTestId("item-card")).toBeNull();
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
    await userEvent.click(within(screen.getByTestId("destination-picker")).getByRole("radio", { name: /^Canada/ }));
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
    const props = { store, models, gate: "no_api" as const, openCamera: okCamera, index, saveCrop: async () => {}, deleteCrop: async () => {}, online: true };
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
    const { unmount } = render(<PackPage store={store} models={{ ...spyModels(), cloud }} gate="no_api" config={{ killCloud: false }} openCamera={okCamera} index={index} saveCrop={saveCrop} deleteCrop={async () => {}} online />);
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
    const store = createBoxStore({ edition: () => ed, persistence: persistence(), now: () => 1000, today: () => "2026-11-25", newId: () => `id-${n++}`, consent: deviceConsent(localStorage) });
    const { models } = setup({ store });
    expect(store.getState().cloudConsent).toBe(true);
    localStorage.setItem("byt.cloudConsent.v2", "false");
    await addPhoto();
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(models.cloud.generate).not.toHaveBeenCalled();
    expect(models.hybrid.generate).not.toHaveBeenCalled();
    localStorage.clear();
  });

  it("clears a read's failure alert once a typed item goes in the box", async () => {
    const failing = { generate: vi.fn(async () => { throw new Error("the model failed"); }) };
    setup({ models: { device: failing, hybrid: failing, cloud: failing } });
    await addPhoto();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Type an item" }));
    await userEvent.selectOptions(screen.getByLabelText("What is it?"), "clothing");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByTestId("newest-sheet");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("opens the back camera on a phone, and the front one on a laptop", async () => {
    const openCamera = vi.fn(okCamera);
    setup({ openCamera, phone: true });
    await userEvent.click(screen.getByRole("button", { name: "Start camera" }));
    await waitFor(() => expect(openCamera).toHaveBeenCalledWith("environment"));
    cleanup();
    const laptop = vi.fn(okCamera);
    setup({ openCamera: laptop });
    await userEvent.click(screen.getByRole("button", { name: "Start camera" }));
    await waitFor(() => expect(laptop).toHaveBeenCalledWith("user"));
  });

  it("shows the sample photo's recorded read, labelled, with no model call and no cloud answer needed", async () => {
    const { models, store } = setup({ loadSample, sampleRead: { read: liquidLotionLabelRead, ms: 3997 } }, null);
    await tryRecordedSample();
    const card = await screen.findByTestId("item-card");
    expect(within(card).getByTestId("source-glyph")).toHaveAccessibleName("Sample, recorded read");
    // A verdict with the cloud question still unanswered: the sample never needs it.
    expect(store.getState().cloudConsent).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(models.cloud.generate).not.toHaveBeenCalled();
    expect(models.hybrid.generate).not.toHaveBeenCalled();
    expect(models.device.generate).not.toHaveBeenCalled();
    expect(store.getState().items[0]).toMatchObject({ readSource: "sample_recorded", readMs: 3997 });
    expect(screen.getByTestId("sample-sent")).toHaveTextContent("recorded read");
    // The photo is the masked copy, and the page says its read was recorded from the photo as taken.
    expect(screen.getByTestId("sample-sent")).toHaveTextContent("The photo is shown with its brand blurred; its read was recorded from the photo as taken.");
  });

  it("clears a blocked alert when the sample's recorded read gives a verdict", async () => {
    setup({ loadSample, sampleRead: { read: liquidLotionLabelRead, ms: 3997 } }, false);
    await addPhoto();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await tryRecordedSample();
    await screen.findByTestId("item-card");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("lets a late failure to keep the sample's photo say nothing over a newer check", async () => {
    let fail: () => void = () => {};
    const saveCrop = vi.fn((key: string) => (key === "sample-key" ? new Promise<void>((_, no) => { fail = () => no(new Error("full")); }) : Promise.resolve()));
    let k = 0;
    setup({ loadSample, sampleRead: { read: liquidLotionLabelRead, ms: 3997 }, saveCrop, newCropKey: () => (k++ === 0 ? "sample-key" : `k-${k}`) }, false);
    await tryRecordedSample();
    await addPhoto();
    const newer = await screen.findByRole("alert");
    const text = newer.textContent;
    await act(async () => { fail(); await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByRole("alert").textContent).toBe(text);
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

  it("reads the sample photo on this device only, with cloud checks off, and never sends it to the cloud", async () => {
    const { models } = setup({ loadSample, gate: "available" }, false);
    await trySample();
    const card = await screen.findByTestId("item-card");
    expect(within(card).getByTestId("source-glyph")).toHaveAccessibleName("Read on this device");
    expect(models.cloud.generate).not.toHaveBeenCalled();
    expect(models.hybrid.generate).not.toHaveBeenCalled();
    expect(models.device.generate).toHaveBeenCalledTimes(1);
  });

  it("reads the sample photo in the cloud after Allow when this device has no model of its own", async () => {
    const { models } = setup({ loadSample, gate: "no_api" }, null);
    await trySample();
    await userEvent.click(await screen.findByRole("button", { name: "Allow" }));
    const card = await screen.findByTestId("item-card");
    expect(within(card).getByTestId("source-glyph")).toHaveAccessibleName("Read in the cloud");
    expect(models.cloud.generate).toHaveBeenCalledTimes(1);
  });

  describe("a press before the page knows whether this device has its own model", () => {
    const page = (store: ReturnType<typeof newStore>, models: ReturnType<typeof spyModels>, gate: PackPageProps["gate"], settingsWaitMs = 10_000,
      online = true, config: PackPageProps["config"] = { killCloud: false }) => (
      <PackPage store={store} models={models} gate={gate} config={config} openCamera={okCamera} index={index}
        saveCrop={async () => {}} deleteCrop={async () => {}} online={online} loadSample={loadSample} settingsWaitMs={settingsWaitMs} />
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
      expect(await screen.findByRole("alert")).toHaveTextContent("Your cloud choice changed while this device was getting ready. Add the photo again.");
      expect(models.cloud.generate).not.toHaveBeenCalled();
      expect(models.hybrid.generate).not.toHaveBeenCalled();
      expect(models.device.generate).not.toHaveBeenCalled();
    });

    it("drops the press when another tab turns cloud checks off and on again while it waits, though storage only shows the last", async () => {
      localStorage.clear();
      const store = createBoxStore({ edition: () => ed, persistence: persistence(), now: () => 1000, today: () => "2026-11-25", newId: () => `id-${n++}`, consent: deviceConsent(localStorage) });
      store.setConsent(true);
      const models = spyModels();
      const view = render(page(store, models, "checking"));
      await trySample();
      await screen.findByTestId("getting-ready");
      // The other tab's off and on arrive together, after both were written.
      act(() => {
        window.dispatchEvent(new StorageEvent("storage", { key: "byt.cloudConsent.v2", newValue: "false" }));
        window.dispatchEvent(new StorageEvent("storage", { key: "byt.cloudConsent.v2", newValue: "true" }));
      });
      view.rerender(page(store, models, "no_api"));
      expect(await screen.findByRole("alert")).toHaveTextContent("Your cloud choice changed while this device was getting ready.");
      expect(models.cloud.generate).not.toHaveBeenCalled();
      localStorage.clear();
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
        if (call === 1) { await new Promise((r) => setTimeout(r, 400)); throw new Error("the model failed"); }
        return { text: JSON.stringify(nothing), source: "on_device" };
      });
      const view = render(page(store, models, "checking"));
      // The older press waits for the model check, then starts its read (the slow one that fails).
      await trySample();
      view.rerender(page(store, models, "available"));
      await waitFor(() => expect(call).toBe(1));
      // The newer press reads at once and finds nothing there.
      await trySample();
      // The alert can exist a moment before its text, so wait for the text itself.
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Nothing to check there. Hold one item inside the box."));
      // The older read fails after the newer notice is up; it must not replace it.
      await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
      expect(screen.getByRole("alert")).toHaveTextContent("Nothing to check there. Hold one item inside the box.");
      expect(call).toBe(2);
    });

    it("says nothing about checks on this device while it is not known whether it has a model", () => {
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
      expect(await screen.findByRole("alert")).toHaveTextContent("This device is still checking whether it can read photos itself.");
      expect(models.cloud.generate).not.toHaveBeenCalled();
      expect(models.hybrid.generate).not.toHaveBeenCalled();
    });

    it("waits, then reads on this device when it has a model and cloud checks are off", async () => {
      const store = newStore();
      store.setConsent(false);
      const models = spyModels();
      const view = render(page(store, models, "checking"));
      // While it checks, nothing on the page says this device cannot read photos.
      expect(screen.getByTestId("cloud-chip")).toHaveTextContent("Cloud: off");
      expect(screen.queryByText(/can't read photos/)).toBeNull();
      await trySample();
      expect(await screen.findByTestId("getting-ready")).toHaveTextContent("Getting ready to check. One moment.");
      expect(models.device.generate).not.toHaveBeenCalled();
      view.rerender(page(store, models, "available"));
      const card = await screen.findByTestId("item-card");
      expect(within(card).getByTestId("source-glyph")).toHaveAccessibleName("Read on this device");
      expect(models.device.generate).toHaveBeenCalledTimes(1);
      expect(models.cloud.generate).not.toHaveBeenCalled();
      expect(models.hybrid.generate).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("waits, then uses this device first when cloud checks are on, never the cloud-only route", async () => {
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
      expect(await screen.findByRole("alert")).toHaveTextContent("This device is still checking whether it can read photos itself. Try again in a moment, or type the item.");
      expect(models.device.generate).not.toHaveBeenCalled();
      expect(models.cloud.generate).not.toHaveBeenCalled();
      expect(screen.queryByTestId("item-card")).toBeNull();
    });
  });

  it("says photos and label text stay on this device when cloud checks are off and it reads on its own", () => {
    setup({ gate: "available" }, false);
    expect(screen.getByText("This device checks items itself. Photos and label text stay on it.")).toBeInTheDocument();
  });

  it("shows cloud checks as one chip that turns them off, and asks again before turning them on", async () => {
    const { store, models } = setup({}, null);
    await userEvent.click(screen.getByTestId("cloud-chip"));
    await userEvent.click(screen.getByRole("button", { name: "Allow" }));
    const chip = screen.getByTestId("cloud-chip");
    expect(chip).toHaveTextContent("Cloud: on");
    expect(chip).toHaveAttribute("aria-pressed", "true");
    // The long cloud line is gone: the chip is the one place the choice shows.
    expect(screen.queryByTestId("cloud-choice")).toBeNull();
    await userEvent.click(chip);
    expect(store.getState().cloudConsent).toBe(false);
    expect(screen.getByTestId("cloud-chip")).toHaveTextContent("Cloud: off");
    expect(screen.getByTestId("cloud-chip")).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("This device checks items in the cloud.")).toBeNull();
    // With cloud checks turned off, a photo does not ask again: it says why it cannot be read.
    await addPhoto();
    expect(await screen.findByRole("alert")).toHaveTextContent("cloud checks are off");
    expect(models.cloud.generate).not.toHaveBeenCalled();
    // Turning them on asks first, and the choice stays off until the sender answers.
    await userEvent.click(screen.getByTestId("cloud-chip"));
    expect(store.getState().cloudConsent).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(store.getState().cloudConsent).toBe(true);
  });

  it("shows paused cloud checks on the chip", () => {
    setup({ config: { killCloud: true } });
    expect(screen.getByTestId("cloud-chip")).toHaveTextContent("Cloud: paused");
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

  it("marks Canada in the country buttons with the suspension the post office has announced", () => {
    setup({ today: "2026-11-25" });
    expect(within(screen.getByTestId("destination-picker")).getByRole("radio", { name: /^Canada/ })).toHaveTextContent("USPS stops Nov 29");
  });

  it("lets the newest-item sheet be closed, and hides it by itself after a while, so it never covers the stage for long", async () => {
    // Long enough that a busy machine still finds the sheet before it goes, short enough to wait for.
    setup({ newestSheetMs: 1500 });
    const add = async (name: string) => {
      await userEvent.click(screen.getByRole("button", { name: "Type an item" }));
      await userEvent.selectOptions(screen.getByLabelText("What is it?"), "clothing");
      await userEvent.type(screen.getByLabelText("Name (optional)"), name);
      await userEvent.click(screen.getByRole("button", { name: "Add" }));
    };
    await add("Wool scarf");
    const sheet = await screen.findByTestId("newest-sheet");
    await userEvent.click(within(sheet).getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("newest-sheet")).toBeNull();
    // A newer item shows its own sheet, which then goes by itself.
    await add("Cotton socks");
    expect(within(await screen.findByTestId("newest-sheet")).getByText("Cotton socks")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("newest-sheet")).toBeNull(), { timeout: 5000 });
  }, 15_000);

  it("shows no alert before the sender has done anything", async () => {
    setup({}, null);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("asks for the cloud choice when nothing else can read the photo, with no alert, and reads it once the sender allows", async () => {
    const { models } = setup({}, null);
    await addPhoto();
    expect(await screen.findByRole("button", { name: "Allow" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(models.cloud.generate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Allow" }));
    await waitFor(() => expect(models.cloud.generate).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says why nothing can read the photo while offline, and clears it once back online", async () => {
    const store = newStore();
    store.setConsent(true);
    const models = spyModels();
    const props = { store, models, gate: "no_api" as const, config: { killCloud: false }, openCamera: okCamera, index, saveCrop: async () => {}, deleteCrop: async () => {} };
    const { rerender } = render(<PackPage {...props} online={false} />);
    await addPhoto();
    expect(await screen.findByRole("alert")).toHaveTextContent("You're offline, and this device can't read photos on its own. Type the item, or try again when you're back online.");
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
    const store = createBoxStore({ edition: () => ed, persistence: { ...noPersistence(), loadBox }, now: () => 1000, today: () => "2026-11-25", newId: () => `id-${n++}` });
    setup({ store });
    expect(within(screen.getByTestId("destination-picker")).getAllByRole("radio").map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "false"]);
    await act(async () => { answer({ status: "failed", error: "offline" }); await store.ready; });
    expect(screen.getByRole("alert")).toHaveTextContent("Your saved box could not be opened. New items stay on this device until it opens.");
    loadBox.mockResolvedValueOnce({ status: "found", box: { destinationCode: "PH", items: [] } });
    await userEvent.click(screen.getByRole("button", { name: "Try opening it again" }));
    await waitFor(() => expect(within(screen.getByTestId("destination-picker")).getByRole("radio", { name: /^Philippines/ })).toHaveAttribute("aria-checked", "true"));
    expect(screen.queryByText("Your saved box could not be opened. New items stay on this device until it opens.")).toBeNull();
  });

  it("says a removal is not saved yet when its delete fails, and offers to save again", async () => {
    const ops = { ...noPersistence(), deleteItem: vi.fn<(boxId: string, itemId: string) => Promise<void>>(async () => { throw new Error("offline"); }) };
    const store = createBoxStore({ edition: () => ed, persistence: ops, now: () => 1000, today: () => "2026-11-25", newId: () => `id-${n++}` });
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

  it("deletes an item's saved photo and label words from this device when the item leaves the box, here or from another device", async () => {
    const deleteCrop = vi.fn<(key: string) => Promise<void>>(async () => {});
    const { store } = setup({ deleteCrop });
    await store.ready;
    act(() => { store.addRecorded({ ...liquidLotionLabelRead, itemName: "Lotion A" }, 1000, "crop-a"); });
    act(() => { store.addRecorded({ ...liquidLotionLabelRead, itemName: "Lotion B" }, 1000, "crop-b"); });
    act(() => { store.addManual({ ...liquidLotionLabelRead, itemName: "Typed lotion" }); });
    await userEvent.click(await screen.findByRole("button", { name: "Remove Lotion A" }));
    await waitFor(() => expect(deleteCrop).toHaveBeenCalledWith("crop-a"));
    // A removal from another device reaches this one as the item leaving the box.
    const b = store.getState().items.find((i) => i.read.itemName === "Lotion B")!;
    act(() => { store.remove(b.itemId); });
    await waitFor(() => expect(deleteCrop).toHaveBeenCalledWith("crop-b"));
    // A typed item has no photo to delete.
    await userEvent.click(await screen.findByRole("button", { name: "Remove Typed lotion" }));
    expect(deleteCrop.mock.calls.map(([k]) => k)).toEqual(["crop-a", "crop-b"]);
  });

  describe("Delete my saved box", () => {
    it("asks first, deletes everything on Delete, then starts the page again; Keep does nothing", async () => {
      const onDeleteBox = vi.fn(async () => ({ ok: true as const, signIn: "deleted" as const }));
      const afterDelete = vi.fn();
      const { store } = setup({ onDeleteBox, afterDelete });
      await store.ready;
      await userEvent.click(screen.getByRole("button", { name: "Delete my saved box" }));
      expect(screen.getByText("This deletes every item in this box from this device and from our database. It cannot be undone.")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Keep" }));
      expect(onDeleteBox).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole("button", { name: "Delete my saved box" }));
      await userEvent.click(screen.getByRole("button", { name: "Delete" }));
      await waitFor(() => expect(afterDelete).toHaveBeenCalledWith("deleted"));
      expect(onDeleteBox).toHaveBeenCalledTimes(1);
    });

    it("says which part is left when deleting stops, and lets the sender try again", async () => {
      const onDeleteBox = vi.fn(async () => ({ ok: false as const, stoppedAt: "signIn" as const }));
      const { store } = setup({ onDeleteBox, afterDelete: vi.fn() });
      await store.ready;
      await userEvent.click(screen.getByRole("button", { name: "Delete my saved box" }));
      await userEvent.click(screen.getByRole("button", { name: "Delete" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("The saved box is deleted, but your anonymous sign-in could not be. Try again.");
      await userEvent.click(screen.getByRole("button", { name: "Try deleting again" }));
      // The retry starts where it stopped, so the steps already done are not run again.
      expect(onDeleteBox).toHaveBeenCalledTimes(2);
      expect(onDeleteBox).toHaveBeenLastCalledWith("signIn");
    });

    it("asks to connect when the delete cannot reach the box, having changed nothing", async () => {
      const onDeleteBox = vi.fn(async () => ({ ok: false as const, offline: true as const }));
      const afterDelete = vi.fn();
      const { store } = setup({ onDeleteBox, afterDelete });
      await store.ready;
      await userEvent.click(screen.getByRole("button", { name: "Delete my saved box" }));
      await userEvent.click(screen.getByRole("button", { name: "Delete" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Connect to the internet to delete your saved box.");
      expect(screen.getByRole("button", { name: "Delete my saved box" })).toBeInTheDocument();
      expect(afterDelete).not.toHaveBeenCalled();
    });

    it("clears the earlier refusal when the question opens again, so a fresh question shows no old error", async () => {
      const onDeleteBox = vi.fn(async () => ({ ok: false as const, offline: true as const }));
      const { store } = setup({ onDeleteBox, afterDelete: vi.fn() });
      await store.ready;
      await userEvent.click(screen.getByRole("button", { name: "Delete my saved box" }));
      await userEvent.click(screen.getByRole("button", { name: "Delete" }));
      await screen.findByText("Connect to the internet to delete your saved box.");
      await userEvent.click(screen.getByRole("button", { name: "Delete my saved box" }));
      expect(screen.getByRole("button", { name: "Keep" })).toBeInTheDocument();
      expect(screen.queryByText("Connect to the internet to delete your saved box.")).toBeNull();
    });

    it("says once that the box was deleted, and when the sign-in was only signed out, that Firebase removes it later", () => {
      setup({ deletedNotice: "signed_out" });
      expect(screen.getByTestId("box-deleted")).toHaveTextContent(
        "Your saved box is deleted. Your anonymous sign-in could not be deleted right away; Firebase may delete it automatically any time after it is 30 days old.");
    });

    it("says only that the box was deleted when the sign-in was not the box's to delete", () => {
      setup({ deletedNotice: "kept" });
      expect(screen.getByTestId("box-deleted")).toHaveTextContent(/^Your saved box is deleted\.$/);
    });

    it("offers no delete button where the page cannot delete a saved box", () => {
      setup();
      expect(screen.queryByRole("button", { name: "Delete my saved box" })).toBeNull();
    });
  });

  it("asks for a reload when the server refuses saves this page used to make, instead of offering a retry that cannot work", async () => {
    const refused = Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    const ops = { ...noPersistence(), putMeta: vi.fn(async () => { throw refused; }) };
    const store = createBoxStore({ edition: () => ed, persistence: ops, now: () => 1000, today: () => "2026-11-25", newId: () => `id-${n++}` });
    const onReload = vi.fn();
    setup({ store, onReload });
    await store.ready;
    act(() => { store.addManual({ ...liquidLotionLabelRead, itemName: "Lotion" }); });
    await store.settled();
    const notice = await screen.findByTestId("out-of-date");
    expect(notice).toHaveTextContent("Saving stopped because this page is out of date. Reload to keep saving.");
    expect(screen.queryByRole("button", { name: "Try saving again" })).toBeNull();
    await userEvent.click(within(notice).getByRole("button", { name: "Reload" }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("says when this browser did not pass the security check, not that the page is out of date, and offers a reload", async () => {
    const refused = Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    const putMeta = vi.fn<(boxId: string, meta: BoxMeta) => Promise<void>>().mockRejectedValueOnce(refused).mockResolvedValue();
    const ops = { ...noPersistence(), putMeta };
    let ok = false;
    const store = createBoxStore({ edition: () => ed, persistence: ops, now: () => 1000, today: () => "2026-11-25", newId: () => `id-${n++}`, verified: async () => ok });
    const onReload = vi.fn();
    setup({ store, onReload });
    await store.ready;
    act(() => { store.addManual({ ...liquidLotionLabelRead, itemName: "Lotion" }); });
    await store.settled();
    const notice = await screen.findByTestId("unverified");
    expect(notice).toHaveTextContent("This browser did not pass the site's security check. Reload the page and try again; if it fails again, try a normal browser window.");
    expect(screen.queryByTestId("out-of-date")).toBeNull();
    await userEvent.click(within(notice).getByRole("button", { name: "Reload page" }));
    expect(onReload).toHaveBeenCalledTimes(1);
    // A save that lands means the check passed after all: the notice goes.
    ok = true;
    act(() => { store.retrySave(); });
    await waitFor(() => expect(screen.queryByTestId("unverified")).toBeNull());
    expect(putMeta).toHaveBeenCalledTimes(2);
  });

  // A box that may not be the whole saved box can hide items, hazards among them: never Ready to tape.
  describe("a box that may not be the whole saved box", () => {
    const shirt: ItemRead = { ...liquidLotionLabelRead, itemName: "Shirt", category: "clothing", labelText: "", liquid: false, evidence: "item_seen" };
    const withShirt = async (ops: ReturnType<typeof noPersistence>, verified?: () => Promise<boolean>) => {
      const store = createBoxStore({ edition: () => ed, persistence: ops, now: () => 1000, today: () => "2026-11-25", newId: () => `id-${n++}`, ...(verified ? { verified } : {}) });
      setup({ store });
      act(() => { store.addManual(shirt); });
      await screen.findByTestId("item-card");
      return store;
    };
    const expectNoAllClear = async () => {
      expect(await screen.findByTestId("box-incomplete")).toHaveTextContent("Can't check the whole box until it syncs.");
      expect(screen.queryByTestId("ready-to-tape")).toBeNull();
      expect(within(screen.getByTestId("box-summary")).queryByText(/OK to pack/)).toBeNull();
    };

    it("says Ready to tape for the whole box, as a control", async () => {
      const store = await withShirt({ ...noPersistence(), loadBox: async (): Promise<LoadResult> => ({ status: "missing", fromServer: true }) });
      await store.ready;
      expect(await screen.findByTestId("ready-to-tape")).toBeInTheDocument();
      expect(screen.queryByTestId("box-incomplete")).toBeNull();
    });

    it("never says it while the saved box is still loading", async () => {
      await withShirt({ ...noPersistence(), loadBox: () => new Promise<LoadResult>(() => {}) });
      await expectNoAllClear();
    });

    it("never says it after the saved box could not be read", async () => {
      const store = await withShirt({ ...noPersistence(), loadBox: async (): Promise<LoadResult> => ({ status: "failed", error: "offline" }) });
      await store.ready;
      await expectNoAllClear();
    });

    it("never says it for a box read only from this browser's cache", async () => {
      const store = await withShirt({ ...noPersistence(), loadBox: async (): Promise<LoadResult> => ({ status: "found", box: { items: [] }, fromServer: false }) });
      await store.ready;
      await expectNoAllClear();
    });

    it("never says it for a box kept only in this browser", async () => {
      const store = await withShirt({ ...noPersistence(), localOnly: () => true });
      await store.ready;
      await expectNoAllClear();
    });

    it("says the box changed in another tab, offers a reload, and never calls it ready", async () => {
      let heard: (() => void) | null = null;
      const changes = { announce: vi.fn(), onChange: (f: () => void) => { heard = f; return () => {}; } };
      const store = createBoxStore({ edition: () => ed, persistence: { ...noPersistence(), loadBox: async (): Promise<LoadResult> => ({ status: "missing", fromServer: true }) },
        now: () => 1000, today: () => "2026-11-25", newId: () => `id-${n++}`, changes });
      const onReload = vi.fn();
      setup({ store, onReload });
      await store.ready;
      act(() => { store.addManual(shirt); });
      expect(await screen.findByTestId("ready-to-tape")).toBeInTheDocument();
      act(() => { heard?.(); });
      const notice = await screen.findByTestId("changed-elsewhere");
      expect(notice).toHaveTextContent("This box changed in another tab.");
      await userEvent.click(within(notice).getByRole("button", { name: "Reload page" }));
      expect(onReload).toHaveBeenCalledTimes(1);
      await expectNoAllClear();
    });

    // Accepted: a box read only from the cache stays not whole until a reload, so the reload is one tap away.
    it("offers a reload for a box read only from this browser's cache", async () => {
      const onReload = vi.fn();
      const store = createBoxStore({ edition: () => ed, persistence: { ...noPersistence(), loadBox: async (): Promise<LoadResult> => ({ status: "found", box: { items: [] }, fromServer: false }) },
        now: () => 1000, today: () => "2026-11-25", newId: () => `id-${n++}`, verified: async () => true });
      setup({ store, onReload });
      await store.ready;
      const notice = await screen.findByTestId("cache-only");
      expect(notice).toHaveTextContent("Showing the copy kept in this browser. Reload once you're online to check the whole box.");
      await userEvent.click(within(notice).getByRole("button", { name: "Reload page" }));
      expect(onReload).toHaveBeenCalledTimes(1);
    });

    it("never says it while App Check refuses this browser, refused box or not", async () => {
      const refusedBox = await withShirt({ ...noPersistence(), loadBox: async (): Promise<LoadResult> => ({ status: "failed", error: "Missing or insufficient permissions." }) }, async () => false);
      await refusedBox.ready;
      await screen.findByTestId("unverified");
      await expectNoAllClear();
      cleanup();
      // Not synced: the box was read from the server, then a save was refused for App Check.
      const refused = Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
      let ok = true;
      const notSynced = await withShirt({ ...noPersistence(), loadBox: async (): Promise<LoadResult> => ({ status: "found", box: { items: [] }, fromServer: true }),
        putMeta: async () => { if (!ok) throw refused; }, putItem: async () => { if (!ok) throw refused; } }, async () => ok);
      await notSynced.ready;
      ok = false;
      act(() => { notSynced.addManual({ ...shirt, itemName: "Socks" }); });
      await screen.findByTestId("unverified");
      await expectNoAllClear();
    });
  });

  describe("a browser App Check cannot verify", () => {
    // A real item, made the way the page makes one.
    const anItem = () => {
      const s = createBoxStore({ edition: () => ed, persistence: noPersistence(), now: () => 1000, today: () => "2026-11-25", newId: () => "kept-1" });
      s.addManual({ ...liquidLotionLabelRead, itemName: "Lotion" });
      return s.getState().items[0]!;
    };

    it("shows the copy this browser kept apart from the box, read only, when the server refuses the box: never the box as new", async () => {
      const ops = {
        ...noPersistence(),
        loadBox: vi.fn(async (): Promise<LoadResult> => ({ status: "failed", error: "Missing or insufficient permissions." })),
        loadCached: vi.fn(async (): Promise<LoadResult> => ({ status: "found", box: { destinationCode: "PH", items: [anItem()] } })),
      };
      const store = createBoxStore({ edition: () => ed, persistence: ops, now: () => 1000, today: () => "2026-11-25", newId: () => `id-${n++}`, verified: async () => false });
      setup({ store, onDeleteBox: vi.fn(async () => ({ ok: false as const, offline: true as const })) });
      await store.ready;
      expect(await screen.findByTestId("unverified")).toHaveTextContent("This browser did not pass the site's security check.");
      expect(await screen.findByTestId("not-synced")).toHaveTextContent("Not synced: below is the copy of your box kept in this browser.");
      const copy = await screen.findByTestId("cached-copy");
      expect(within(copy).getByRole("heading", { name: "Kept in this browser, for Philippines" })).toBeInTheDocument();
      expect(within(copy).getByText("Lotion")).toBeInTheDocument();
      expect(within(copy).getByTestId("verdict-chip")).toBeInTheDocument();
      // Read only: no card and no control for the copy.
      expect(within(copy).queryAllByRole("button")).toEqual([]);
      expect(screen.queryByTestId("item-card")).toBeNull();
      expect(screen.queryByText("Nothing in the box yet.")).toBeNull();
      expect(screen.queryByText(/Your saved box could not be opened/)).toBeNull();
      expect(screen.queryByRole("button", { name: "Delete my saved box" })).toBeNull();
    });

    // With reCAPTCHA blocked, Firestore gives up on the server and answers from its cache, so the box opens.
    it("marks a box that opened from this browser's cache not synced, and offers no delete", async () => {
      const ops = { ...noPersistence(), loadBox: vi.fn(async (): Promise<LoadResult> => ({ status: "found", box: { destinationCode: "PH", items: [anItem()] }, fromServer: false })) };
      const store = createBoxStore({ edition: () => ed, persistence: ops, now: () => 1000, today: () => "2026-11-25", newId: () => `id-${n++}`, verified: async () => false });
      setup({ store, onDeleteBox: vi.fn(async () => ({ ok: false as const, offline: true as const })) });
      await store.ready;
      expect(await screen.findByTestId("not-synced")).toHaveTextContent("Not synced: you're seeing the copy kept in this browser.");
      expect(screen.queryByRole("button", { name: "Delete my saved box" })).toBeNull();
    });

    it("never calls a box new or empty when the cache did not hold it, or it never loaded", async () => {
      const missing = { ...noPersistence(), loadBox: vi.fn(async (): Promise<LoadResult> => ({ status: "missing", fromServer: false })) };
      const a = createBoxStore({ edition: () => ed, persistence: missing, now: () => 1000, today: () => "2026-11-25", newId: () => `id-${n++}`, verified: async () => false });
      const first = render(<PackPage store={a} models={spyModels()} gate="no_api" config={{ killCloud: false }} openCamera={okCamera} index={index}
        saveCrop={async () => {}} deleteCrop={async () => {}} online />);
      await a.ready;
      expect(await screen.findByTestId("not-synced")).toHaveTextContent("Not synced: your saved box can't be shown until this browser passes the security check.");
      expect(screen.queryByText("Nothing in the box yet.")).toBeNull();
      first.unmount();
      const pending = { ...noPersistence(), loadBox: vi.fn(() => new Promise<LoadResult>(() => {})) };
      const b = createBoxStore({ edition: () => ed, persistence: pending, now: () => 1000, today: () => "2026-11-25", newId: () => `id-${n++}`, verified: async () => false });
      setup({ store: b });
      expect(await screen.findByTestId("not-synced")).toHaveTextContent("Not synced: your saved box can't be shown until this browser passes the security check.");
      expect(screen.getByTestId("unverified")).toBeInTheDocument();
      expect(screen.queryByText("Nothing in the box yet.")).toBeNull();
    });
  });

  it("says in Your box that a photo is being read in the cloud, then where it ran and how long, until its card goes", async () => {
    let release!: (r: ModelReply) => void;
    const cloud = { generate: vi.fn(() => new Promise<ModelReply>((r) => { release = r; })) };
    let t = 0;
    const { store } = setup({ models: { ...spyModels(), cloud }, now: () => t });
    await store.ready;
    await addPhoto();
    const box = screen.getByTestId("box-summary");
    await waitFor(() => expect(within(box).getByTestId("read-status")).toHaveTextContent("Reading in the cloud"));
    expect(box).not.toHaveTextContent("Nothing in the box yet.");
    t = 2500;
    act(() => release({ text: JSON.stringify(liquidLotionLabelRead), source: "in_cloud" }));
    const card = await screen.findByTestId("item-card");
    await waitFor(() => expect(within(box).getByTestId("read-status")).toHaveTextContent("Read in the cloud, 2.5 s"));
    // The line is about that item: once it leaves the box, the line goes too.
    await userEvent.click(within(card).getByRole("button", { name: /^Remove / }));
    await waitFor(() => expect(within(screen.getByTestId("box-summary")).getByTestId("read-status")).toBeEmptyDOMElement());
  });

  it("says a read is running on this device, and clears that line when the read fails", async () => {
    let fail!: (e: unknown) => void;
    const device = { generate: vi.fn(() => new Promise<ModelReply>((_, f) => { fail = f; })) };
    const { store } = setup({ models: { ...spyModels(), device }, gate: "available" }, false);
    await store.ready;
    await addPhoto();
    const box = screen.getByTestId("box-summary");
    await waitFor(() => expect(within(box).getByTestId("read-status")).toHaveTextContent("Reading on this device"));
    act(() => fail(new Error("model busy")));
    expect(await screen.findByText("This device couldn't read that one. Try again, or type the item.")).toBeInTheDocument();
    expect(within(box).getByTestId("read-status")).toBeEmptyDOMElement();
    expect(box).toHaveTextContent("Nothing in the box yet.");
  });

  it("clears the reading line when a device read runs out of time, even if the model never answers", async () => {
    const device = { generate: vi.fn(() => new Promise<ModelReply>(() => {})) };
    const { store } = setup({ models: { ...spyModels(), device }, gate: "available", readTimeoutMs: 50 }, false);
    await store.ready;
    await addPhoto();
    expect(await screen.findByText("The check took too long. Try again or type the item.")).toBeInTheDocument();
    expect(within(screen.getByTestId("box-summary")).getByTestId("read-status")).toBeEmptyDOMElement();
  });

  it("keeps saying a read is running while an older one runs, when a newer one ends first with no item", async () => {
    const releases: ((r: ModelReply) => void)[] = [];
    const cloud = { generate: vi.fn(() => new Promise<ModelReply>((r) => { releases.push(r); })) };
    const { store } = setup({ models: { ...spyModels(), cloud } });
    await store.ready;
    await addPhoto();
    await addPhoto();
    await waitFor(() => expect(releases).toHaveLength(2));
    const nothing: ItemRead = { ...liquidLotionLabelRead, itemName: "", category: "other", labelText: "", liquid: false, evidence: "not_sure" };
    act(() => releases[1]?.({ text: JSON.stringify(nothing), source: "in_cloud" }));
    expect(await screen.findByText("Nothing to check there. Hold one item inside the box.")).toBeInTheDocument();
    expect(within(screen.getByTestId("box-summary")).getByTestId("read-status")).toHaveTextContent("Reading in the cloud");
    expect(screen.getByTestId("box-summary")).not.toHaveTextContent("Nothing in the box yet.");
  });

  it("says the cloud once a read that started on this device goes on to the cloud", async () => {
    const hybrid = { generate: vi.fn(async (): Promise<ModelReply> => { throw new Error("on-device model failed"); }) };
    const cloud = { generate: vi.fn(() => new Promise<ModelReply>(() => {})) };
    const { store } = setup({ models: { ...spyModels(), hybrid, cloud }, gate: "available" });
    await store.ready;
    await addPhoto();
    await waitFor(() => expect(cloud.generate).toHaveBeenCalled());
    await waitFor(() => expect(within(screen.getByTestId("box-summary")).getByTestId("read-status")).toHaveTextContent("Reading in the cloud"));
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
