import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourceGlyph } from "./SourceGlyph";

describe("SourceGlyph", () => {
  it("says where each read ran, in words a screen reader reads out", () => {
    for (const [source, name] of [
      ["on_device", "Read on this device"], ["in_cloud", "Read in the cloud"], ["manual", "Typed by you"],
      ["phone_on_device", "Read on your phone"], ["phone_cloud", "Read in the cloud, from your phone"],
      ["cloud_unreported", "Route not reported"],
    ] as const) {
      const { unmount } = render(<SourceGlyph source={source} />);
      expect(screen.getByTestId("source-glyph"), source).toHaveAccessibleName(name);
      unmount();
    }
  });

  it("names both reads once a second look in the cloud has run", () => {
    render(<SourceGlyph source="on_device" checkedInCloud />);
    expect(screen.getByTestId("source-glyph")).toHaveAccessibleName("Read on this device, then checked in the cloud");
    expect(screen.getByTestId("source-glyph")).toHaveTextContent("Read on this device, then checked in the cloud");
  });
});
