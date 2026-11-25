import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NO_READS, ReadStatus, readDone, readEnded, readStarted, readToCloud, shownRead } from "./ReadStatus";

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

  it("shows the newest read still running, then the newest that ended with a card while its item is in the box", () => {
    const inBox = (id: string) => id === "a" || id === "b";
    let s = readStarted(readStarted(NO_READS, 1, false, 10), 2, false, 20);
    expect(shownRead(s, inBox)).toEqual({ kind: "reading", inCloud: false, start: 20 });
    // The newer read ends with no card: the older one, still running, is shown.
    s = readEnded(s, 2);
    expect(shownRead(s, inBox)).toEqual({ kind: "reading", inCloud: false, start: 10 });
    s = readToCloud(s, 1);
    expect(shownRead(s, inBox)).toEqual({ kind: "reading", inCloud: true, start: 10 });
    // The older read ends with a card, but a later read was started since: its line is not shown.
    expect(shownRead(readDone(s, 1, "a", "in_cloud", 3000), inBox)).toBeNull();
    // With no later read, a finished read shows while its item is in the box.
    s = readDone(readStarted(NO_READS, 5, true, 0), 5, "a", "in_cloud", 3000);
    expect(shownRead(s, inBox)).toEqual({ kind: "read", source: "in_cloud", ms: 3000 });
    expect(shownRead(s, () => false)).toBeNull();
    // An older read that ends after a newer one keeps the newer one's line.
    s = readDone(readStarted(readStarted(NO_READS, 3, false, 0), 4, false, 0), 4, "b", "on_device", 1000);
    expect(shownRead(readDone(s, 3, "a", "on_device", 9000), inBox)).toEqual({ kind: "read", source: "on_device", ms: 1000 });
  });

  it("never lets an older read's result stand in for a newer one, across a third read that ends with no card", () => {
    const inBox = () => true;
    let s = readStarted(readStarted(NO_READS, 1, false, 0), 2, false, 0);
    s = readDone(s, 2, "b", "on_device", 2000);
    s = readEnded(readStarted(s, 3, false, 0), 3);
    s = readDone(s, 1, "a", "in_cloud", 9000);
    expect(shownRead(s, inBox)).toBeNull();
    // A later read that ends with a card shows again.
    s = readDone(readStarted(s, 4, false, 0), 4, "d", "on_device", 1500);
    expect(shownRead(s, inBox)).toEqual({ kind: "read", source: "on_device", ms: 1500 });
  });

  it("stays mounted and empty when no read is running, so the next one is announced", () => {
    render(<ReadStatus line={null} now={() => 0} />);
    expect(screen.getByTestId("read-status")).toBeEmptyDOMElement();
  });
});
