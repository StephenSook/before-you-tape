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
// A clock that moves 1.5 s between the press and the verdict on screen.
const clock = () => { let t = 1000; return () => (t += 1500); };
const judge = () => "take_out" as const;

describe("LiveReadPanel", () => {
  it("loads nothing until the judge presses the button", () => {
    const { load } = deps();
    render(<LiveReadPanel load={load} judge={judge} />);
    expect(screen.getByRole("button", { name: "Run one live read" })).toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
  });

  it("reads the sample on this laptop when it can, and says where and how long from the press", async () => {
    const { load, m } = deps({ gate: "available" });
    render(<LiveReadPanel load={load} judge={judge} now={clock()} />);
    await userEvent.click(screen.getByRole("button", { name: "Run one live read" }));
    expect(await screen.findByTestId("live-read-where")).toHaveTextContent("Read on this laptop, 1.5 s");
    expect(screen.getByTestId("verdict-chip")).toHaveTextContent("Take it out");
    expect(screen.getByTestId("live-read-name")).toHaveTextContent(SAMPLE_READ.read.itemName);
    expect(m.device.generate).toHaveBeenCalledTimes(1);
    expect(m.cloud.generate).not.toHaveBeenCalled();
  });

  it("reads in the cloud when this laptop cannot and cloud checks are on", async () => {
    const { load, m } = deps({ consent: true });
    render(<LiveReadPanel load={load} judge={judge} now={clock()} />);
    await userEvent.click(screen.getByRole("button", { name: "Run one live read" }));
    expect(await screen.findByTestId("live-read-where")).toHaveTextContent("Read in the cloud, 1.5 s");
    expect(m.cloud.generate).toHaveBeenCalledTimes(1);
  });

  it("asks first when the cloud is needed and the judge has not allowed it, and reads nothing until Allow", async () => {
    const { load, m, consent } = deps({ consent: null });
    render(<LiveReadPanel load={load} judge={judge} />);
    await userEvent.click(screen.getByRole("button", { name: "Run one live read" }));
    expect(await screen.findByRole("button", { name: "Allow" })).toHaveFocus();
    expect(m.cloud.generate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(consent()).toBe(true);
    expect(await screen.findByTestId("live-read-where")).toHaveTextContent("Read in the cloud");
  });

  it("reads nothing when the judge keeps it on this laptop and the laptop cannot read", async () => {
    const { load, m, consent } = deps({ consent: null });
    render(<LiveReadPanel load={load} judge={judge} />);
    await userEvent.click(screen.getByRole("button", { name: "Run one live read" }));
    await userEvent.click(await screen.findByRole("button", { name: "Check on this laptop only" }));
    expect(consent()).toBe(false);
    expect(await screen.findByRole("alert")).toHaveTextContent("This laptop can't read photos on its own, and cloud checks are off.");
    expect(m.cloud.generate).not.toHaveBeenCalled();
  });

  it("reads nothing in the cloud while cloud checks are paused", async () => {
    const { load, m } = deps({ consent: true, paused: true });
    render(<LiveReadPanel load={load} judge={judge} />);
    await userEvent.click(screen.getByRole("button", { name: "Run one live read" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cloud checks are paused right now");
    expect(m.cloud.generate).not.toHaveBeenCalled();
  });

  it("never reads a sample photo whose bytes do not match its record", async () => {
    const { load, m } = deps({ gate: "available", sample: async () => { throw new SampleMismatch(); } });
    render(<LiveReadPanel load={load} judge={judge} />);
    await userEvent.click(screen.getByRole("button", { name: "Run one live read" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The sample photo did not match its record, so it was not read.");
    expect(m.device.generate).not.toHaveBeenCalled();
  });

  // The wait is long here, so a busy machine cannot let it pass between the two clicks.
  it("runs one read at a time, and waits before it can run again", async () => {
    const { load, m } = deps({ gate: "available" });
    render(<LiveReadPanel load={load} judge={judge} cooldownMs={60_000} />);
    const button = screen.getByRole("button", { name: "Run one live read" });
    await userEvent.click(button);
    await userEvent.click(button);
    await screen.findByTestId("live-read-where");
    expect(m.device.generate).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
  });

  it("runs again once the wait is over", async () => {
    const { load, m } = deps({ gate: "available" });
    render(<LiveReadPanel load={load} judge={judge} cooldownMs={50} />);
    const button = screen.getByRole("button", { name: "Run one live read" });
    await userEvent.click(button);
    await screen.findByTestId("live-read-where");
    await waitFor(() => expect(button).toBeEnabled(), { timeout: 5000 });
    await act(async () => { await userEvent.click(button); });
    await waitFor(() => expect(m.device.generate).toHaveBeenCalledTimes(2));
  });
});
