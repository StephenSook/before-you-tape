import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ed } from "../../tests/engine/helpers";
import type { ModelPort } from "../ai/port";
import { ITEM_READ_PROMPT } from "../ai/prompts";
import { SECOND_LOOK_TEXT } from "../ai/secondLook";
import { noPersistence } from "../data/boxOps";
import { createBoxStore } from "../data/boxStore";
import type { SecondLookPolicy } from "../routing/policy";
import type { ItemRead } from "../shared/itemRead";
import { PackPage, type PackPageProps } from "./PackPage";

const base: ItemRead = {
  itemName: "Phone", category: "phone", labelText: "", volts: 0, milliampHours: 0, wattHours: 0, lithiumGrams: 0,
  batteryWords: false, liquid: false, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false, glassContainer: false,
  powder: false, retailBox: "cannot_tell", evidence: "label_read",
};
// 3.7 V x 2500 mAh is 9.25 Wh, more than 3 percent from the printed 9.62: a Wh mismatch.
const phoneDevice: ItemRead = { ...base, labelText: "LI-ION 3.7V 2500mAh 9.62Wh", volts: 3.7, milliampHours: 2500, wattHours: 9.62, batteryWords: true };
const phoneCloud: ItemRead = { ...phoneDevice, labelText: "LI-ION 3.7V 2600mAh 9.62Wh", milliampHours: 2600 };
const lotion: ItemRead = { ...base, itemName: "Body lotion", category: "lotion_cream", labelText: "SHEA BODY LOTION 8 FL OZ", liquid: true };

type Spy = ModelPort & { generate: ReturnType<typeof vi.fn> };
const answers = (read: ItemRead, source: "on_device" | "in_cloud"): Spy => ({ generate: vi.fn(async () => ({ text: JSON.stringify(read), source })) });
const failing = (msg: string): Spy => ({ generate: vi.fn(async () => { throw new Error(msg); }) });

let n = 0;
function setup(o: { device?: ItemRead; cloud?: Spy; killCloud?: boolean; consent?: boolean; online?: boolean; secondLook?: SecondLookPolicy } = {}) {
  const store = createBoxStore({ edition: () => ed, persistence: noPersistence(), now: () => 1000, today: () => "2026-11-20", newId: () => `sl-${n++}` });
  store.setConsent(o.consent ?? true);
  const read = o.device ?? phoneDevice;
  const models = { device: answers(read, "on_device"), hybrid: answers(read, "on_device"), cloud: o.cloud ?? answers(phoneCloud, "in_cloud"), fallback: answers(phoneCloud, "in_cloud") };
  const props = (online: boolean): PackPageProps => ({
    store, models, gate: "available", config: { killCloud: o.killCloud ?? false, ...(o.secondLook ? { secondLook: o.secondLook } : {}) }, index: [{ code: "CA", name: "Canada", immUrl: "https://pe.usps.com/text/imm/ce_003.htm" }],
    openCamera: async () => ({ stream: { getTracks: () => [] } as unknown as MediaStream, stop: () => {} }), saveCrop: async () => {}, online,
  });
  const view = render(<PackPage {...props(o.online ?? true)} />);
  return { store, models, rerender: (online: boolean) => view.rerender(<PackPage {...props(online)} />) };
}
const photo = new File(["x"], "phone.jpg", { type: "image/jpeg" });
// Adds a photo and presses "Check this part" on the crop step, as a sender does.
const upload = async () => {
  await userEvent.upload(screen.getByTestId("upload-input"), photo);
  const send = await screen.findByRole("button", { name: "Check this part" });
  await waitFor(() => expect(send).toBeEnabled());
  await userEvent.click(send);
};

describe("Pack page second look", () => {
  beforeAll(() => { vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined); });
  beforeEach(() => { vi.stubGlobal("createImageBitmap", vi.fn(async () => { const c = document.createElement("canvas"); c.width = 64; c.height = 64; return c; })); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("settles a second look still waiting on the cloud when the sender takes back consent, and says it was not checked", async () => {
    // A cloud call that never answers, as one waiting on sign-in or on the SDK's tokens can.
    const { store } = setup({ cloud: { generate: vi.fn(() => new Promise<never>(() => {})) } });
    await upload();
    expect(await screen.findByText("Checking again in the cloud.")).toBeInTheDocument();
    act(() => store.setConsent(false));
    await waitFor(() => expect(screen.queryByText("Checking again in the cloud.")).toBeNull());
    expect(screen.getByRole("alert")).toHaveTextContent("Cloud checks are off right now, so this was not checked again.");
  });

  it("keeps a hazard word only the cloud's shorter label had, after the merge kept the device's longer label", async () => {
    const device: ItemRead = { ...phoneDevice, labelText: "LI-ION 3.7V 2500mAh 9.62Wh RECHARGEABLE BATTERY PACK MODEL X100" };
    const cloud = answers({ ...phoneCloud, labelText: "FLAMMABLE 3.7V 2600mAh 9.62Wh" }, "in_cloud");
    const { store } = setup({ device, cloud });
    await upload();
    await waitFor(() => expect(cloud.generate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(store.getState().items[0]?.secondLook).not.toBeNull());
    const item = store.getState().items[0]!;
    expect(item.read.labelText).toBe(device.labelText);
    expect(item.labelTags).toContain("flammable");
  });

  it("reads an on-device Wh mismatch again in the cloud with the same crop and prompt, and keeps the merge", async () => {
    const { store, models } = setup();
    await upload();
    await screen.findByTestId("second-look");
    expect(screen.getByTestId("second-look")).toHaveTextContent(SECOND_LOOK_TEXT.wh_mismatch);
    expect(models.cloud.generate).toHaveBeenCalledTimes(1);
    // The same prompt and crop, with the cloud check and the abort signal the page fires on a withdrawal.
    expect(models.cloud.generate).toHaveBeenCalledWith(ITEM_READ_PROMPT, models.hybrid.generate.mock.calls[0]?.[1], { allowed: expect.any(Function), signal: expect.any(AbortSignal) });
    const item = store.getState().items[0];
    expect(item?.read.milliampHours).toBe(2600);
    expect(item?.secondLook?.reason).toBe(SECOND_LOOK_TEXT.wh_mismatch);
    expect(store.getState().sources.secondLooks).toBe(1);
  });

  it("makes zero model calls for second looks when kill_cloud is on or consent was not given", async () => {
    for (const o of [{ killCloud: true }, { consent: false }]) {
      const { models, store } = setup(o);
      await upload();
      await waitFor(() => expect(store.getState().items).toHaveLength(1));
      expect(models.device.generate, JSON.stringify(o)).toHaveBeenCalledTimes(1);
      expect(models.cloud.generate, JSON.stringify(o)).not.toHaveBeenCalled();
      expect(models.fallback.generate, JSON.stringify(o)).not.toHaveBeenCalled();
      expect(screen.queryByText("Checking again in the cloud.")).toBeNull();
      cleanup();
    }
  });

  it("shows both battery readings after a second look, and one tap settles them", async () => {
    const { store } = setup();
    await upload();
    const box = await screen.findByRole("group", { name: "The two reads disagree. Pick what the item shows." });
    const id = store.getState().items[0]!.itemId;
    expect(store.getState().result.items[id]?.level).toBe("check");
    await userEvent.click(within(box).getByRole("button", { name: "Second look: 3.7 V, 2600 mAh, 9.62 Wh" }));
    expect(store.getState().items[0]?.disputes?.battery?.resolved).toBe(true);
    expect(store.getState().items[0]?.read.milliampHours).toBe(2600);
    expect(screen.queryByRole("group", { name: "The two reads disagree. Pick what the item shows." })).toBeNull();
  });

  it("follows a policy that turns the reason off", async () => {
    const { models, store } = setup({ secondLook: { whMismatch: false, batteryNumbers: false, notSure: true, hazardNoLabel: true, identity: true } });
    await upload();
    await waitFor(() => expect(store.getState().items).toHaveLength(1));
    expect(models.cloud.generate).not.toHaveBeenCalled();
  });

  it("asks for no second look when the device read needs none", async () => {
    const { models, store } = setup({ device: lotion });
    await upload();
    await waitFor(() => expect(store.getState().items).toHaveLength(1));
    expect(models.cloud.generate).not.toHaveBeenCalled();
    expect(screen.queryByTestId("second-look")).toBeNull();
  });

  it("keeps the device verdict when the second look is refused, and Try again runs it", async () => {
    const cloud = failing("fetch-error 403");
    const { store } = setup({ cloud });
    await upload();
    expect(await screen.findByRole("alert")).toHaveTextContent("The cloud step was refused. Try a normal browser window.");
    expect(store.getState().items[0]?.read.milliampHours).toBe(2500);
    expect(within(screen.getByTestId("item-card")).getByTestId("verdict-chip")).toHaveTextContent("Check this");
    cloud.generate.mockResolvedValueOnce({ text: JSON.stringify(phoneCloud), source: "in_cloud" });
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByTestId("second-look");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(store.getState().items[0]?.read.milliampHours).toBe(2600);
  });

  it("runs one second look at a time for an item, and runs a Try again pressed during one after it ends", async () => {
    const cloud = failing("fetch-error 403");
    setup({ cloud });
    await upload();
    expect(await screen.findByRole("alert")).toHaveTextContent("The cloud step was refused. Try a normal browser window.");
    let fail: (e: Error) => void = () => {};
    cloud.generate.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Checking again in the cloud.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(cloud.generate).toHaveBeenCalledTimes(2);
    cloud.generate.mockResolvedValueOnce({ text: JSON.stringify(phoneCloud), source: "in_cloud" });
    await act(async () => { fail(new Error("fetch-error 403")); await Promise.resolve(); });
    await screen.findByTestId("second-look");
    expect(cloud.generate).toHaveBeenCalledTimes(3);
  });

  it("runs the second look of a device read that ends after the page came back online", async () => {
    let finish: (v: { text: string; source: "on_device" }) => void = () => {};
    const device = { generate: vi.fn(() => new Promise<{ text: string; source: "on_device" }>((r) => { finish = r; })) };
    const store = createBoxStore({ edition: () => ed, persistence: noPersistence(), now: () => 1000, today: () => "2026-11-20", newId: () => `sl-${n++}` });
    store.setConsent(true);
    const cloud = answers(phoneCloud, "in_cloud");
    const props = (online: boolean): PackPageProps => ({
      store, models: { device, hybrid: device, cloud }, gate: "available", config: { killCloud: false },
      index: [{ code: "CA", name: "Canada", immUrl: "https://pe.usps.com/text/imm/ce_003.htm" }],
      openCamera: async () => ({ stream: { getTracks: () => [] } as unknown as MediaStream, stop: () => {} }), saveCrop: async () => {}, online,
    });
    const view = render(<PackPage {...props(false)} />);
    await upload();
    await waitFor(() => expect(device.generate).toHaveBeenCalledTimes(1));
    view.rerender(<PackPage {...props(true)} />);
    await act(async () => { finish({ text: JSON.stringify(phoneDevice), source: "on_device" }); await Promise.resolve(); });
    await screen.findByTestId("second-look");
    expect(cloud.generate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("No connection. This check will run when you are back online.")).toBeNull();
  });

  it("ends a second look that takes too long with a plain notice, not as if cloud checks were off", async () => {
    const cloud: Spy = { generate: vi.fn(() => new Promise<never>(() => {})) };
    const store = createBoxStore({ edition: () => ed, persistence: noPersistence(), now: () => 1000, today: () => "2026-11-20", newId: () => `sl-${n++}` });
    store.setConsent(true);
    render(<PackPage store={store} models={{ device: answers(phoneDevice, "on_device"), hybrid: answers(phoneDevice, "on_device"), cloud }} gate="available" config={{ killCloud: false }}
      index={[{ code: "CA", name: "Canada", immUrl: "https://pe.usps.com/text/imm/ce_003.htm" }]} openCamera={async () => ({ stream: { getTracks: () => [] } as unknown as MediaStream, stop: () => {} })}
      saveCrop={async () => {}} online readTimeoutMs={50} />);
    await upload();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The cloud step took too long. Try again."));
    expect(screen.queryByText("Checking again in the cloud.")).toBeNull();
    expect(store.getState().items[0]?.read.milliampHours).toBe(2500);
  });

  it("never sends a removed item's photo to the cloud, even when its look was waiting for the connection", async () => {
    const cloud = failing("Failed to fetch");
    const { rerender } = setup({ cloud });
    await upload();
    expect(await screen.findByRole("alert")).toHaveTextContent("No connection. This check will run when you are back online.");
    cloud.generate.mockResolvedValue({ text: JSON.stringify(phoneCloud), source: "in_cloud" });
    const calls = cloud.generate.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: /^Remove / }));
    rerender(false);
    rerender(true);
    await new Promise((r) => setTimeout(r, 100));
    expect(cloud.generate).toHaveBeenCalledTimes(calls);
  });

  it("runs a second look that failed for no connection again once the page is back online", async () => {
    const cloud = failing("Failed to fetch");
    const { store, rerender } = setup({ cloud });
    await upload();
    expect(await screen.findByRole("alert")).toHaveTextContent("No connection. This check will run when you are back online.");
    cloud.generate.mockResolvedValue({ text: JSON.stringify(phoneCloud), source: "in_cloud" });
    rerender(false);
    expect(cloud.generate).toHaveBeenCalledTimes(2);
    rerender(true);
    await screen.findByTestId("second-look");
    expect(store.getState().items[0]?.read.milliampHours).toBe(2600);
  });
});
