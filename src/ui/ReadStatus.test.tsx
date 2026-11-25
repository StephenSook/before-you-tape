import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReadStatus } from "./ReadStatus";

describe("ReadStatus", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("says a read is running on this device, with the seconds so far, in a live region", () => {
    vi.useFakeTimers();
    let t = 5000;
    render(<ReadStatus line={{ kind: "reading", inCloud: false, start: 5000 }} now={() => t} />);
    const s = screen.getByTestId("read-status");
    expect(s).toHaveAttribute("role", "status");
    expect(s).toHaveTextContent("Reading on this device, 0 s");
    t = 8400;
    act(() => { vi.advanceTimersByTime(1000); });
    expect(s).toHaveTextContent("Reading on this device, 3 s");
  });

  it("says the cloud when the read goes to the cloud", () => {
    render(<ReadStatus line={{ kind: "reading", inCloud: true, start: 0 }} now={() => 0} />);
    expect(screen.getByTestId("read-status")).toHaveTextContent("Reading in the cloud, 0 s");
  });

  it("keeps the ticking seconds out of what a screen reader announces", () => {
    render(<ReadStatus line={{ kind: "reading", inCloud: false, start: 0 }} now={() => 0} />);
    expect(screen.getByText(", 0 s")).toHaveAttribute("aria-hidden", "true");
  });

  it("ends with where the read ran and how long it took, as /judge says it", () => {
    render(<ReadStatus line={{ kind: "read", source: "on_device", ms: 4420 }} now={() => 0} />);
    expect(screen.getByTestId("read-status")).toHaveTextContent("Read on this device, 4.4 s");
  });

  it("stays mounted and empty when no read is running, so the next one is announced", () => {
    render(<ReadStatus line={null} now={() => 0} />);
    expect(screen.getByTestId("read-status")).toBeEmptyDOMElement();
  });
});
