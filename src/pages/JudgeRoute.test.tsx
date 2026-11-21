import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import manifest from "../../eval/set/manifest.json";
import { pickRecordedReads } from "../judge/recordedReads";
import { JudgeRoute } from "./JudgeRoute";

describe("JudgeRoute", () => {
  it("shows the recorded on-device block exactly when a tracked record qualifies", () => {
    const tracked = Object.values(import.meta.glob("../../evidence/device-e2e/*.json", { eager: true, import: "default" }));
    expect(tracked.length).toBeGreaterThan(0);
    const want = pickRecordedReads(tracked, new Set(manifest.items.map((i) => i.itemId)));
    render(<MemoryRouter><JudgeRoute /></MemoryRouter>);
    if (want) expect(screen.getByTestId("recorded-reads")).toHaveTextContent(`Chrome ${want.chromeVersion}`);
    else expect(screen.queryByTestId("recorded-reads")).toBeNull();
  });
});
