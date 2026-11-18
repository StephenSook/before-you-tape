import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourceGlyph } from "./SourceGlyph";

describe("SourceGlyph", () => {
  it("says where each read ran, in words a screen reader reads out", () => {
    for (const [source, name] of [
      ["on_device", "Read on this laptop"], ["in_cloud", "Read in the cloud"], ["manual", "Typed by you"],
      ["phone_on_device", "Read on your phone"], ["phone_cloud", "Read in the cloud, from your phone"],
    ] as const) {
      const { unmount } = render(<SourceGlyph source={source} />);
      expect(screen.getByTestId("source-glyph"), source).toHaveAccessibleName(name);
      unmount();
    }
  });
});
