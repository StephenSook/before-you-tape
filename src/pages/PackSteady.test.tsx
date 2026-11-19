// What the pack page sends where when the camera reads by itself. jsdom draws no frames, so the detector
// sees every frame as steady and the crop is stood in for; everything after that is the real page.
// The first test is the guard against a change that sends a steady frame to the cloud.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ed } from "../../tests/engine/helpers";
import type { GateState, ImagePart, ItemModels, ModelPort } from "../ai/port";
import { createBoxStore, type BoxPersistence } from "../data/boxStore";
import type { ItemRead } from "../shared/itemRead";
import { PackPage } from "./PackPage";
import { consentServer } from "../../tests/fakes/consentServer";

vi.mock("../capture/steady", async (importOriginal) => {
  const real = await importOriginal<typeof import("../capture/steady")>();
  // Steady once, then quiet, as a real item held still would be after its read.
  class SteadyOnce { fired = false; push() { if (this.fired) return null; this.fired = true; return { type: "steady" as const, box: { x: 0.25, y: 0.15, w: 0.5, h: 0.7 } }; } }
  return { ...real, SteadyDetector: SteadyOnce };
});
vi.mock("../capture/crop", async (importOriginal) => {
  const real = await importOriginal<typeof import("../capture/crop")>();
  return { ...real, cropToJpeg: async (): Promise<ImagePart> => ({ mimeType: "image/jpeg", base64: "/9j/AAAA" }) };
});

const base: ItemRead = {
  itemName: "Power bank", category: "power_bank", labelText: "POWER BANK 50000mAh 3.7V 185Wh", volts: 3.7, milliampHours: 50000, wattHours: 185,
  lithiumGrams: 0, batteryWords: true, liquid: false, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false, glassContainer: false,
  powder: false, retailBox: "cannot_tell", evidence: "label_read",
};
const roomFrame: ItemRead = { ...base, itemName: "unknown", category: "other", labelText: "", volts: 0, milliampHours: 0, wattHours: 0, batteryWords: false, evidence: "not_sure" };
const port = (read: ItemRead, source: "on_device" | "in_cloud"): ModelPort & { generate: ReturnType<typeof vi.fn> } =>
  ({ generate: vi.fn(async () => ({ text: JSON.stringify(read), source })) });
const models = (read: ItemRead) => ({ device: port(read, "on_device"), hybrid: port(read, "on_device"), cloud: port(base, "in_cloud") }) satisfies ItemModels;
const persistence = (): BoxPersistence => consentServer();
const index = [{ code: "CA", name: "Canada", immUrl: "https://pe.usps.com/text/imm/ce_003.htm" }];
const camera = async () => ({ stream: { getTracks: () => [] } as unknown as MediaStream, stop: () => {} });

function setup(gate: GateState, read: ItemRead) {
  const store = createBoxStore({ edition: () => ed, persistence: persistence(), now: () => 1000, today: () => "2026-11-20", newId: () => "id-1" });
  store.setConsent(true);
  const m = models(read);
  render(<PackPage store={store} models={m} gate={gate} config={{ killCloud: false }} openCamera={camera} index={index}
    saveCrop={async () => {}} online />);
  return { store, m };
}
const startCamera = () => userEvent.click(screen.getByRole("button", { name: "Start camera" }));
const settle = () => new Promise((r) => setTimeout(r, 400));

describe("PackPage when the camera reads by itself", () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(4);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      { drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray(64 * 36 * 4) }) } as unknown as CanvasRenderingContext2D);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("reads a steady frame on this device only, even after Allow, and offers the cloud look as a button", async () => {
    const { m } = setup("available", base);
    await startCamera();
    const card = await screen.findByTestId("item-card");
    await settle();
    expect(m.device.generate).toHaveBeenCalledTimes(1);
    expect(m.hybrid.generate).not.toHaveBeenCalled();
    expect(m.cloud.generate).not.toHaveBeenCalled();
    await userEvent.click(within(card).getByRole("button", { name: "Check it in the cloud" }));
    await waitFor(() => expect(m.cloud.generate).toHaveBeenCalledTimes(1));
  });

  it("reads nothing by itself when this device has no model of its own", async () => {
    const { m } = setup("no_api", base);
    await startCamera();
    await settle();
    expect(m.device.generate).not.toHaveBeenCalled();
    expect(m.hybrid.generate).not.toHaveBeenCalled();
    expect(m.cloud.generate).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("drops a read of no item with a hint, and adds no card", async () => {
    const { store } = setup("available", roomFrame);
    await startCamera();
    expect(await screen.findByRole("alert")).toHaveTextContent("Nothing to check there. Hold one item inside the box.");
    expect(screen.queryByTestId("item-card")).toBeNull();
    expect(store.getState().items).toHaveLength(0);
  });
});
