import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EvalSummary } from "../ran/evalSummary";
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
    // After a photo read on this device, the second look runs by itself when the rules ask and cloud checks are on.
    expect(within(row(/second look/)).getByText(/by itself/)).toBeInTheDocument();
    expect(within(row(/second look/)).queryByText(/only when you press it/)).toBeNull();
    expect(within(row(/Fix this reading/)).getByText(/Nothing goes to a model/)).toBeInTheDocument();
  });

  it("never says nothing leaves when the box list is saved, and points at what it holds", () => {
    render(<RanPage />);
    // Typing an item and changing the country call no model, but the box list (and its country) is saved.
    expect(within(row(/Type an item/)).getByText("Nothing goes to a model. The box list is saved, as the line below the table says.")).toBeInTheDocument();
    expect(within(row(/Change the country/)).getByText("Nothing goes to a model. The new country is saved with the box list.")).toBeInTheDocument();
    for (const r of screen.getAllByRole("row")) expect(r.textContent, r.textContent ?? "").not.toMatch(/Nothing\.$/);
  });

  it("says what the saved box list holds, and that it never holds the photo or the label text", () => {
    render(<RanPage />);
    expect(screen.getByText("Photos and label text stay on this device. Your box list is saved so it survives a reload. It holds each item's category, how many, its battery numbers, the Wh and lithium-grams figures its label names, your answers and the rule words found on its label, never the photo or the label text.")).toBeInTheDocument();
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
    // Our own deploy checks and tests save boxes the same way a visitor does, with nothing that tells them apart,
    // so the heading and the line say the totals include them rather than reading as usage.
    expect(screen.getByRole("heading", { level: 3, name: "Saved boxes, our own checks included" })).toBeInTheDocument();
    expect(screen.queryByText(/Visitors' saved boxes/)).toBeNull();
    expect(screen.getByTestId("measured")).toHaveTextContent(
      "27 items read in the cloud (counting reads whose route the SDK did not report) and fewer than 5 on the device, in 269 saved boxes, our own test runs included, so these show where reads ran, not how many people used the app. The records don't say why a read went to the cloud. Measured November 21, 2026.");
    const detail = screen.getByText("How this was measured").closest("details")!;
    expect(detail).not.toHaveAttribute("open");
    for (const line of [
      "Read in the cloud, or by a route the SDK did not report: 27, median 0.9 s, 90th percentile 2.3 s",
      "Read on the device: fewer than 5",
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
    expect(screen.queryByText(/27 items/)).toBeNull();
  });

  it("shows no number from a file it cannot read, and says why", () => {
    render(<RanPage measured={{ ...measured(), boxes: { n: 3 } }} today="2026-11-21" />);
    expect(screen.getByTestId("measured")).toHaveTextContent("Measured numbers are not shown: the file could not be read.");
    render(<RanPage measured={undefined} today="2026-11-21" />);
    expect(screen.getAllByTestId("measured")[1]).toHaveTextContent("Measured numbers are not shown: the file could not be read.");
  });

  const ranEval = (): EvalSummary => ({
    runId: "models-2026-11-21", date: "2026-11-21", machine: "Apple M5 Pro, 48 GB", chrome: "157.0.8103.80",
    models: "device: Chrome built-in model; cloud: a cloud model", editionId: "byt-3b5f5508968f",
    source: "eval/runs/models-2026-11-21.public.json", items: 40, destinations: 2, checks: 80, readOnDevice: 80,
    secondLookItems: 13, agreement: { k: 69, n: 80 }, hazardsCalledOk: { k: 0, n: 28 }, checkThis: { k: 14, n: 80 },
    p50Ms: 4868, p90Ms: 7735, withoutRuleChanges: { items: 38, agreement: { k: 67, n: 76 }, hazardsCalledOk: { k: 0, n: 26 } },
  });

  it("leads with our own test, before the saved-box totals, with its detail behind a disclosure", () => {
    render(<RanPage ranEval={ranEval()} measured={measured()} today="2026-11-21" />);
    const ours = screen.getByTestId("eval-measured");
    expect(ours).toHaveTextContent(
      "40 items for 2 countries. All 80 checks were read on the device by Chrome's built-in model, 13 items also got a second look in the cloud, and no hazard was called OK to pack (0 of 28). Run November 21, 2026.");
    expect(ours.compareDocumentPosition(screen.getByTestId("measured")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const detail = screen.getByText("How our test was run").closest("details")!;
    expect(detail).not.toHaveAttribute("open");
    for (const line of [
      "Agreement with our draft labels: 69 of 80 checks. No second person has checked the labels, so this is not accuracy.",
      "Check this: 14 of 80 checks",
      "Time to a verdict: median 4.9 s, 90th percentile 7.7 s, second look included",
      "Computer: Apple M5 Pro, 48 GB, Chrome 157.0.8103.80",
      "Models: device: Chrome built-in model; cloud: a cloud model",
      "Rules: edition byt-3b5f5508968f",
    ]) expect(within(detail).getByText(line)).toBeInTheDocument();
    expect(within(detail).getByText(/Source: eval\/runs\/models-2026-11-21\.public\.json\. These are our own test photos, not visitors'\./)).toBeInTheDocument();
  });

  it("says plainly when not every check was read on the device, or a hazard was called OK", () => {
    render(<RanPage ranEval={{ ...ranEval(), readOnDevice: 70, secondLookItems: 1, hazardsCalledOk: { k: 2, n: 28 } }} measured={measured()} today="2026-11-21" />);
    expect(screen.getByTestId("eval-measured")).toHaveTextContent(
      "40 items for 2 countries. 70 of 80 checks were read on the device by Chrome's built-in model, 1 item also got a second look in the cloud, and 2 of 28 hazards were called OK to pack. Run November 21, 2026.");
  });

  it("shows no number from our test when its file cannot be read, and says why", () => {
    render(<RanPage ranEval={{ ...ranEval(), checks: "80" }} measured={measured()} today="2026-11-21" />);
    expect(screen.getByTestId("eval-measured")).toHaveTextContent("Our test numbers are not shown: the file could not be read.");
    expect(screen.queryByText(/69 of 80/)).toBeNull();
  });
});
