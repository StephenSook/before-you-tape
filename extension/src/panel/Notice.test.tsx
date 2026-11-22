import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { bundledEdition } from "../edition";
import { openBridge } from "../bridgeClient";
import { typedRead } from "../check";
import { onToolbarClick } from "../tabInfo";
import { Panel } from "./Panel";
import { canRead, canUseCloud, initial, reduce } from "./state";

function props() {
  return {
    agreed: false,
    cloudConsent: null,
    saveAgreement: vi.fn(async () => {}),
    saveCloudConsent: vi.fn(async () => {}),
    clearStorage: vi.fn(async () => {}),
    loadTab: vi.fn(() => () => {}),
    fetchEdition: vi.fn(async () => ({ edition: bundledEdition, from: "live" as const, notice: null })),
  };
}

it("reads nothing before the sender agrees", () => {
  expect(canRead(initial())).toBe(false);
  render(<Panel {...props()} />);
  expect(screen.queryByLabelText("What is it?")).toBeNull();
  expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "./extension-privacy.html");
});

it("does not load the tab title or the rule file before the sender agrees", async () => {
  const panelProps = props();
  const user = userEvent.setup();
  let resolveAgreement!: () => void;
  const agreement = new Promise<void>((resolve) => { resolveAgreement = resolve; });
  panelProps.saveAgreement.mockReturnValue(agreement);
  render(<Panel {...panelProps} />);
  await user.click(screen.getByRole("button", { name: "OK, start" }));
  expect(panelProps.saveAgreement).toHaveBeenCalledOnce();
  expect(panelProps.loadTab).not.toHaveBeenCalled();
  expect(panelProps.fetchEdition).not.toHaveBeenCalled();
  resolveAgreement();
  await waitFor(() => expect(panelProps.loadTab).toHaveBeenCalledOnce());
  expect(panelProps.fetchEdition).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("What is it?")).toBeVisible();
});

it("the toolbar opens without reading title or link before consent", async () => {
  const readTitle = vi.fn(() => "Private title");
  const readUrl = vi.fn(() => "https://shop.example/p/1");
  const api = { open: vi.fn(async () => {}), setSession: vi.fn(async () => {}), canCapture: vi.fn(async () => false) };
  onToolbarClick({ id: 1, get title() { return readTitle(); }, get url() { return readUrl(); } }, api, 1);
  expect(api.open).toHaveBeenCalledOnce();
  await waitFor(() => expect(api.canCapture).toHaveBeenCalledOnce());
  expect(readTitle).not.toHaveBeenCalled();
  expect(readUrl).not.toHaveBeenCalled();
  expect(api.setSession).not.toHaveBeenCalled();
});

it("treats unanswered cloud consent as no", () => {
  const state = reduce(initial(), { type: "opened", agreed: true });
  expect(canUseCloud(state)).toBe(false);
  expect(canUseCloud({ ...state, cloudConsent: false })).toBe(false);
  expect(canUseCloud({ ...state, cloudConsent: true })).toBe(true);
  expect(canUseCloud({ ...initial(), cloudConsent: true })).toBe(false);
});

it("saves cloud choices without running a cloud check", async () => {
  const panelProps = props();
  const user = userEvent.setup();
  render(<Panel {...panelProps} agreed />);
  await user.click(screen.getByText("Cloud settings"));
  await user.click(screen.getByRole("button", { name: "Allow" }));
  expect(panelProps.saveCloudConsent).toHaveBeenLastCalledWith(true);
  await user.click(screen.getByRole("button", { name: "Not now" }));
  expect(panelProps.saveCloudConsent).toHaveBeenLastCalledWith(false);
  expect(panelProps.fetchEdition).toHaveBeenCalledOnce();
  expect(screen.getByText("Cloud checks are off in this panel.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Open the full app" })).toHaveAttribute("href", "https://before-you-tape-2026.web.app/");
});

it("clears the panel data and returns to the notice", async () => {
  const panelProps = props();
  const user = userEvent.setup();
  render(<Panel {...panelProps} agreed />);
  await user.type(screen.getByLabelText("What is it?"), "Scarf");
  await user.click(screen.getByRole("button", { name: "Clear" }));
  expect(panelProps.clearStorage).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText("What is it?")).toBeNull();
  expect(screen.getByRole("button", { name: "OK, start" })).toBeVisible();
  expect(panelProps.fetchEdition.mock.calls).toHaveLength(1);
});

it("shows the download button when the model is downloadable", async () => {
  const user = userEvent.setup();
  const device = {
    check: vi.fn().mockResolvedValueOnce("downloadable").mockResolvedValueOnce("available"),
    prepare: vi.fn(async () => {}),
    read: vi.fn(),
  };
  render(<Panel {...props()} agreed device={device} />);
  await user.click(await screen.findByRole("button", { name: "Get this laptop ready" }));
  expect(device.prepare).toHaveBeenCalledOnce();
  expect(await screen.findByRole("button", { name: "Read on this laptop" })).toBeVisible();
});

it("gives a verdict from typed details with no model", async () => {
  const user = userEvent.setup();
  render(<Panel {...props()} agreed />);
  await user.type(screen.getByLabelText("What is it?"), "Power bank");
  await user.selectOptions(screen.getByLabelText("Item type"), "power_bank");
  await user.click(screen.getByRole("button", { name: "Check" }));
  expect(screen.getByRole("heading", { name: "Take it out" })).toBeVisible();
  expect(screen.getByText("Typed by you")).toBeVisible();
});

it("lets the sender edit the laptop read and confirm its identity before the engine can clear it", async () => {
  const user = userEvent.setup();
  const read = typedRead({
    itemName: "Scarf", category: "clothing", volts: 0, milliampHours: 0, wattHours: 0,
    liquid: false, pressurized: false, alcoholOnLabel: false, batteryWords: false,
  });
  const device = {
    check: vi.fn(async () => "available" as const),
    prepare: vi.fn(async () => {}),
    read: vi.fn(async () => ({ read, source: "on_device" as const })),
  };
  const panelProps = props();
  panelProps.fetchEdition.mockResolvedValue({
    edition: {
      ...bundledEdition,
      suspensions: { ...bundledEdition.suspensions, checkedOn: "2026-11-20" },
    },
    from: "live",
    notice: null,
  });
  vi.setSystemTime(new Date(2026, 10, 20, 12));
  try {
    render(<Panel {...panelProps} agreed device={device} />);
    await user.selectOptions(screen.getByLabelText("Sending to"), "CA");
    await user.type(await screen.findByLabelText("Paste the product details from the shop page"), "Cotton scarf");
    await user.click(screen.getByRole("button", { name: "Read on this laptop" }));
    expect(device.read).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("What is it?")).toHaveValue("Scarf");
    expect(screen.getByLabelText("Sending to")).toHaveValue("CA");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByRole("heading", { name: "Check this" })).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: "Is the item type clothing? Yes" }));
    await user.selectOptions(screen.getByLabelText("Item type"), "power_bank");
    expect(screen.getByRole("checkbox", { name: "Is the item type power bank? Yes" })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByRole("heading", { name: "Take it out" })).toBeVisible();
    expect(screen.getByText("Read on this laptop", { selector: ".verdict-meta div" })).toBeVisible();
  } finally {
    vi.useRealTimers();
  }
});

it("makes no request before consent, then opens the bridge without sending product text", async () => {
  const user = userEvent.setup();
  const read = vi.fn();
  const close = vi.fn();
  const connectCloud = vi.fn(async (signal: AbortSignal) => {
    signal.addEventListener("abort", close, { once: true });
    return { read, close };
  });
  render(<Panel {...props()} agreed cloudConsent={null} connectCloud={connectCloud} />);
  expect(connectCloud).not.toHaveBeenCalled();
  expect(document.querySelector("iframe")).toBeNull();
  await user.click(screen.getByText("Cloud settings"));
  await user.click(screen.getByRole("button", { name: "Allow" }));
  expect(connectCloud).toHaveBeenCalledOnce();
  expect(await screen.findByRole("button", { name: "Read in the cloud" })).toBeDisabled();
  expect(read).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText("Paste the product details from the shop page"), "Cotton scarf");
  expect(read).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Not now" }));
  expect(close).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button", { name: "Read in the cloud" })).toBeNull();
});

it("opens the bridge when the stored choice is Allow, says cloud checks are on, and sends no product text", async () => {
  const read = vi.fn();
  const connectCloud = vi.fn(async () => ({ read, close: vi.fn() }));
  render(<Panel {...props()} agreed cloudConsent={true} connectCloud={connectCloud} />);
  expect(await screen.findByText("Cloud checks are on in this panel.")).toBeVisible();
  expect(connectCloud).toHaveBeenCalledOnce();
  expect(screen.queryByText("Cloud checks are off in this panel.")).toBeNull();
  expect(read).not.toHaveBeenCalled();
});

it("stays off when the stored choice is Not now", () => {
  const connectCloud = vi.fn();
  render(<Panel {...props()} agreed cloudConsent={false} connectCloud={connectCloud} />);
  expect(connectCloud).not.toHaveBeenCalled();
  expect(screen.getByText("Cloud checks are off in this panel.")).toBeVisible();
});

it("shows cloud off when the bridge does not answer", async () => {
  // Fake time: the bridge's own wait, and nothing else, decides when it gives up. With real time a slow machine
  // took longer than the wait to finish the clicks, and the bridge gave up before the first check.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    const connectCloud = (signal: AbortSignal) => openBridge(document, "https://bridge.example/", 150, signal);
    render(<Panel {...props()} agreed connectCloud={connectCloud} />);
    // Clicks that use no timers of their own, so fake time stands still through them.
    fireEvent.click(screen.getByText("Cloud settings"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Allow" })); });
    expect(screen.getByText("Opening cloud checks.")).toBeVisible();
    expect(document.querySelector("iframe")).not.toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(149); });
    expect(screen.getByText("Opening cloud checks.")).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByText("Cloud checks are off in this panel.")).toBeVisible();
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.getByRole("link", { name: "Open the full app" })).toBeVisible();
    expect(screen.getByLabelText("What is it?")).toBeVisible();
  } finally {
    vi.useRealTimers();
  }
});

it("drops a cloud reply that arrives after consent is withdrawn", async () => {
  const user = userEvent.setup();
  let reply!: (value: { text: string; source: "in_cloud" }) => void;
  const outcome = new Promise<{ text: string; source: "in_cloud" }>((resolve) => { reply = resolve; });
  const read = vi.fn(() => outcome);
  const connectCloud = async () => ({ read, close: vi.fn() });
  render(<Panel {...props()} agreed connectCloud={connectCloud} />);

  await user.click(screen.getByText("Cloud settings"));
  await user.click(screen.getByRole("button", { name: "Allow" }));
  await user.type(await screen.findByLabelText("Paste the product details from the shop page"), "Cotton scarf");
  await user.click(screen.getByRole("button", { name: "Read in the cloud" }));
  expect(read).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Not now" }));
  reply({ text: JSON.stringify(typedRead({
    itemName: "Scarf", category: "clothing", volts: 0, milliampHours: 0, wattHours: 0,
    liquid: false, pressurized: false, alcoholOnLabel: false, batteryWords: false,
  })), source: "in_cloud" });

  await waitFor(() => expect(screen.queryByText("Reading the product details.")).toBeNull());
  expect(screen.getByLabelText("What is it?")).toHaveValue("");
  expect(screen.getByText("Cloud checks are off in this panel.")).toBeVisible();
});
