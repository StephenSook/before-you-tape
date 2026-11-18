import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VerdictChip } from "./VerdictChip";

describe("VerdictChip", () => {
  it("shows the word with an icon", () => {
    render(<VerdictChip level="take_out" />);
    expect(screen.getByTestId("verdict-chip")).toHaveTextContent("Take it out");
    expect(screen.getByRole("img", { hidden: true })).toBeInTheDocument();
  });

  it("names each verdict the way the engine does and gives each its own style", () => {
    const { rerender } = render(<VerdictChip level="ok" />);
    expect(screen.getByTestId("verdict-chip")).toHaveTextContent("OK to pack");
    expect(screen.getByTestId("verdict-chip")).toHaveClass("chip-ok");
    rerender(<VerdictChip level="check" />);
    expect(screen.getByTestId("verdict-chip")).toHaveTextContent("Check this");
    expect(screen.getByTestId("verdict-chip")).toHaveClass("chip-check");
  });
});
