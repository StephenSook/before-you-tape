import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { GateState, ImagePart, ItemModels } from "../ai/port";
import { SAMPLE_READ } from "../data/sampleRead";
import { LiveReadPanel, SampleMismatch, type LiveReadDeps } from "./LiveReadPanel";

const part: ImagePart = { mimeType: "image/jpeg", base64: "/9j/AAAA" };
const answers = (source: "on_device" | "in_cloud") => ({ generate: vi.fn(async () => ({ text: JSON.stringify(SAMPLE_READ.read), source })) });
const models = (): ItemModels & { device: ReturnType<typeof answers>; cloud: ReturnType<typeof answers> } =>
  ({ device: answers("on_device"), hybrid: answers("on_device"), cloud: answers("in_cloud") });

function deps(o: { gate?: GateState; consent?: boolean | null; paused?: boolean; sample?: () => Promise<ImagePart> } = {}) {
  let consent = o.consent ?? null;
  const m = models();
  const d: LiveReadDeps = {
    gate: async () => o.gate ?? "no_api",
    consent: { get: () => consent, set: (v) => { consent = v; } },
    paused: async () => o.paused ?? false,
    models: () => m,
    sample: o.sample ?? (async () => part),
  };
  return { d, m, consent: () => consent, load: vi.fn(async () => d) };
}
const judge = () => "take_out" as const;

describe("LiveReadPanel", () => {
  it("loads nothing until the judge presses the button", () => {
    const { load } = deps();
    render(<LiveReadPanel load={load} judge={judge} country="Philippines" />);
    expect(screen.getByRole("button", { name: "Run one live read" })).toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
  });

  it("reads the sample on this device when it can, and says where and how long from the press", async () => {
    const { load, m } = deps({ gate: "available" });
    render(<LiveReadPanel load={load} judge={judge} country="Philippines" now={ticks(1000, 1100, 1200, 2500)} />);
    await userEvent.click(screen.getByRole("button", { name: "Run one live read" }));
    expect(await screen.findByTestId("live-read-where")).toHaveTextContent("Read on this device, 1.5 s");
    expect(screen.getByTestId("verdict-chip")).toHaveTextContent("Take it out");
    expect(screen.getByTestId("live-read-name")).toHaveTextContent(SAMPLE_READ.read.itemName);
    expect(m.device.generate).toHaveBeenCalledTimes(1);
    expect(m.cloud.generate).not.toHaveBeenCalled();
  });

  it("reads in the cloud when this device cannot and cloud checks are on", async () => {
    const { load, m } = deps({ consent: true });
    render(<LiveReadPanel load={load} judge={judge} country="Philippines" now={ticks(1000, 1100, 1200, 2500)} />);
    await userEvent.click(screen.getByRole("button", { name: "Run one live read" }));
    expect(await screen.findByTestId("live-read-where")).toHaveTextContent("Read in the cloud, 1.5 s");
    expect(m.cloud.generate).toHaveBeenCalledTimes(1);
  });

  it("asks first when the cloud is needed and the judge has not allowed it, and reads nothing until Allow", async () => {
    const { load, m, consent } = deps({ consent: null });
    render(<LiveReadPanel load={load} judge={judge} country="Philippines" />);
    await userEvent.click(screen.getByRole("button", { name: "Run one live read" }));
    expect(await screen.findByRole("button", { name: "Allow" })).toHaveFocus();
    expect(m.cloud.generate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(consent()).toBe(true);
    expect(await screen.findByTestId("live-read-where")).toHaveTextContent("Read in the cloud");
  });

  it("reads nothing when the judge keeps it on this device and the laptop cannot read", async () => {
    const { load, m, consent } = deps({ consent: null });
    render(<LiveReadPanel load={load} judge={judge} country="Philippines" />);
    await userEvent.click(screen.getByRole("button", { name: "Run one live read" }));
    await userEvent.click(await screen.findByRole("button", { name: "Check on this device only" }));
    expect(consent()).toBe(false);
    expect(await screen.findByRole("alert")).toHaveTextContent("This device can't read photos on its own, and cloud checks are off.");
    expect(m.cloud.generate).not.toHaveBeenCalled();
  });

  it("reads nothing in the cloud while cloud checks are paused", async () => {
    const { load, m } = deps({ consent: true, paused: true });
    render(<LiveReadPanel load={load} judge={judge} country="Philippines" />);
    await userEvent.click(screen.getByRole("button", { name: "Run one live read" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cloud checks are paused right now");
    expect(m.cloud.generate).not.toHaveBeenCalled();
  });

  it("never reads a sample photo whose bytes do not match its record", async () => {
    const { load, m } = deps({ gate: "available", sample: async () => { throw new SampleMismatch(); } });
    render(<LiveReadPanel load={load} judge={judge} country="Philippines" />);
    await userEvent.click(screen.getByRole("button", { name: "Run one live read" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The sample photo did not match its record, so it was not read.");
    expect(m.device.generate).not.toHaveBeenCalled();
  });

  // The wait is long here, so a busy machine cannot let it pass between the two clicks.
  it("runs one read at a time, and waits before it can run again", async () => {
    const { load, m } = deps({ gate: "available" });
    render(<LiveReadPanel load={load} judge={judge} country="Philippines" cooldownMs={60_000} />);
    const button = screen.getByRole("button", { name: "Run one live read" });
    await userEvent.click(button);
    await userEvent.click(button);
    await screen.findByTestId("live-read-where");
    expect(m.device.generate).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
  });

  it("runs again once the wait is over", async () => {
    const { load, m } = deps({ gate: "available" });
    render(<LiveReadPanel load={load} judge={judge} country="Philippines" cooldownMs={50} />);
    const button = screen.getByRole("button", { name: "Run one live read" });
    await userEvent.click(button);
    await screen.findByTestId("live-read-where");
    await waitFor(() => expect(button).toBeEnabled(), { timeout: 5000 });
    await act(async () => { await userEvent.click(button); });
    await waitFor(() => expect(m.device.generate).toHaveBeenCalledTimes(2));
  });

  it("names the country it judged with the verdict", async () => {
    const { load } = deps({ gate: "available" });
    render(<LiveReadPanel load={load} judge={judge} country="Philippines" />);
    await userEvent.click(screen.getByRole("button", { name: "Run one live read" }));
    expect(await screen.findByTestId("live-read-verdict")).toHaveTextContent("Take it out for the Philippines");
  });

  // Four clock readings: the press, the start of the read, after the photo, after the model.
  const ticks = (...t: number[]) => { let i = 0; return () => t[Math.min(i++, t.length - 1)]!; };

  it("keeps the time per step in a closed Details, and says when the model took most of it", async () => {
    const { load } = deps({ gate: "available" });
    render(<LiveReadPanel load={load} judge={judge} country="Philippines" now={ticks(0, 400, 600, 30_000)} />);
    await userEvent.click(screen.getByRole("button", { name: "Run one live read" }));
    expect(await screen.findByTestId("live-read-where")).toHaveTextContent("Read on this device, 30.0 s");
    expect(screen.getByTestId("live-read-verdict")).toHaveTextContent("Take it out for the Philippines");
    const details = screen.getByText("Details").closest("details")!;
    expect(details).not.toHaveAttribute("open");
    expect(details).toHaveTextContent("Start: 0.4 s");
    expect(details).toHaveTextContent("Photo: 0.2 s");
    expect(details).toHaveTextContent("Model: 29.4 s");
    // The model took most of the time on this press, so the details say so.
    expect(details).toHaveTextContent("Most of this time was the model's run.");
  });

  it("says nothing about the model's share when it took less than half the time", async () => {
    const { load } = deps({ gate: "available" });
    render(<LiveReadPanel load={load} judge={judge} country="Canada" now={ticks(0, 3000, 3200, 5000)} />);
    await userEvent.click(screen.getByRole("button", { name: "Run one live read" }));
    expect(await screen.findByTestId("live-read-verdict")).toHaveTextContent("Take it out for Canada");
    expect(screen.getByText("Details").closest("details")).not.toHaveTextContent("Most of this time");
  });
});

