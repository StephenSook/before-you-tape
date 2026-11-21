import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Measured } from "../ran/summarize";
import { RanPage } from "./RanPage";

const row = (action: RegExp) => screen.getAllByRole("row").find((r) => action.test(within(r).queryAllByRole("cell")[0]?.textContent ?? ""))!;

describe("RanPage", () => {
  it("says, for each thing a sender does, where it runs and what leaves the device", () => {
    render(<RanPage />);
    expect(screen.getByRole("heading", { level: 1, name: "What ran where" })).toBeInTheDocument();
    expect(within(row(/Type an item/)).getByText(/No model/)).toBeInTheDocument();
    expect(within(row(/Hold an item still/)).getByText(/never the cloud/)).toBeInTheDocument();
    expect(within(row(/Check now/)).getByText(/only if you allowed cloud checks/)).toBeInTheDocument();
    expect(within(row(/Change the country/)).getByText(/0 model calls/)).toBeInTheDocument();
    expect(within(row(/Check it in the cloud/)).getByText(/only when you press it/)).toBeInTheDocument();
  });

  it("says what the saved box list holds, and that it never holds the photo or the label text", () => {
    render(<RanPage />);
    expect(screen.getByText("Photos and label text stay on this device. Your box list is saved so it survives a reload. It holds each item's category, how many, its battery numbers, your answers and the rule words found on its label, never the photo or the label text.")).toBeInTheDocument();
  });

  const measured = (): Measured => ({
    measuredAt: "2026-11-21T11:08:35.432Z",
    source: "Route records in the saved boxes",
    window: { from: "2026-11-18", to: "2026-11-21" },
    boxes: { n: 269 },
    items: { n: 161 },
    typedByHand: { n: 131 },
    reads: { onDevice: { fewerThan: 5 }, inCloud: { n: 27, p50Ms: 900, p90Ms: 2257 } },
    secondLooks: { fewerThan: 5 },
    fallbacks: { fewerThan: 5 },
  });

  it("says in few words what was measured, and when, with the detail behind a disclosure", () => {
    render(<RanPage measured={measured()} today="2026-11-21" />);
    expect(screen.getByTestId("measured")).toHaveTextContent(
      "27 items read in the cloud and fewer than 5 on this device, in 269 saved boxes. Measured November 21, 2026.");
    const detail = screen.getByText("How this was measured").closest("details")!;
    expect(detail).not.toHaveAttribute("open");
    for (const line of [
      "Read in the cloud: 27, median 0.9 s, 90th percentile 2.3 s",
      "Read on this device: fewer than 5",
      "Second looks in the cloud: fewer than 5",
      "Cloud fallbacks: fewer than 5",
      "Typed by hand, our own deploy checks included: 131",
      "Items: 161, in 269 saved boxes, saved from November 18 to November 21, 2026",
    ]) expect(within(detail).getByText(line)).toBeInTheDocument();
    expect(within(detail).getByText(/Route records in the saved boxes/)).toBeInTheDocument();
    expect(within(detail).getByText(/Any total under 5 shows as fewer than 5/)).toBeInTheDocument();
  });

  it("shows no number from a file measured more than 14 days ago, and says why", () => {
    render(<RanPage measured={measured()} today="2026-12-06" />);
    expect(screen.getByTestId("measured")).toHaveTextContent("Measured numbers are not shown: they are more than 14 days old.");
    expect(screen.queryByText(/27/)).toBeNull();
  });

  it("shows no number from a file it cannot read, and says why", () => {
    render(<RanPage measured={{ ...measured(), boxes: { n: 3 } }} today="2026-11-21" />);
    expect(screen.getByTestId("measured")).toHaveTextContent("Measured numbers are not shown: the file could not be read.");
    render(<RanPage measured={undefined} today="2026-11-21" />);
    expect(screen.getAllByTestId("measured")[1]).toHaveTextContent("Measured numbers are not shown: the file could not be read.");
  });
});
