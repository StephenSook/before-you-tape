import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PackRoute } from "./PackRoute";

describe("PackRoute", () => {
  it("says plainly that it cannot check items when this build has no Firebase settings", () => {
    // The test run has no VITE_FB_* values, like a build made without them.
    render(<PackRoute />);
    expect(screen.getByRole("alert")).toHaveTextContent("This copy of the site is missing its settings, so it cannot check items.");
  });
});
