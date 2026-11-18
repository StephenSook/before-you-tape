import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ed } from "../../tests/engine/helpers";
import type { ItemModels, ModelPort } from "../ai/port";
import { createBoxStore, type BoxPersistence } from "../data/boxStore";
import type { ItemRead } from "../shared/itemRead";
import { PackPage, type PackPageProps } from "./PackPage";

const liquidLotionLabelRead: ItemRead = {
  itemName: "Body lotion", category: "lotion_cream", labelText: "SHEA BODY LOTION 8 FL OZ", volts: 0, milliampHours: 0, wattHours: 0,
  lithiumGrams: 0, batteryWords: false, liquid: true, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false,
  glassContainer: false, powder: false, retailBox: "cannot_tell", evidence: "label_read",
};
const port = (source: "on_device" | "in_cloud"): ModelPort & { generate: ReturnType<typeof vi.fn> } =>
  ({ generate: vi.fn(async () => ({ text: JSON.stringify(liquidLotionLabelRead), source })) });
const spyModels = () => ({ device: port("on_device"), hybrid: port("on_device"), cloud: port("in_cloud") }) satisfies ItemModels;
const persistence: BoxPersistence = { save: () => {}, load: async () => null };
let n = 0;
const newStore = () => createBoxStore({ edition: () => ed, persistence, now: () => 1000, today: () => "2026-11-20", newId: () => `id-${n++}` });
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

  it("makes no model call when the cloud is paused", async () => {
    const { models } = setup({ config: { killCloud: true } });
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
    expect(within(card).getByTestId("verdict-chip")).toHaveTextContent("OK to pack");
    expect(within(card).getByTestId("source-glyph")).toHaveAccessibleName("Read in the cloud");
    expect(within(card).getByTestId("crop-image")).toHaveAttribute("src", expect.stringMatching(/^data:image\/jpeg/));
    expect(models.cloud.generate).toHaveBeenCalledTimes(1);
    await userEvent.selectOptions(screen.getByTestId("destination-picker"), "PH");
    expect(within(screen.getByTestId("item-card")).getByTestId("verdict-chip")).toHaveTextContent("Take it out");
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
    const { models } = setup();
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
    const { store } = setup();
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
});
