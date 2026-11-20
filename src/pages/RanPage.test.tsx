import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
