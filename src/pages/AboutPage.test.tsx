import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import manifest from "../../eval/set/manifest.json";
import { BRANDS, brandWord } from "../judge/brands.fixture";
import { AboutPage } from "./AboutPage";
import { READ_TIMING_SENT } from "../ui/readTimingCopy";

describe("AboutPage", () => {
  it("says what the app does and what leaves the device, in plain words", () => {
    render(<AboutPage />);
    expect(screen.getByRole("heading", { level: 1, name: "About Before You Tape" })).toBeInTheDocument();
    expect(screen.getByText(/The rules run in your browser/)).toBeInTheDocument();
    expect(screen.getByText(/only if you allow it/)).toBeInTheDocument();
    expect(screen.getByText("Photos and label text stay on this device. Your box list is saved so it survives a reload. It holds each item's category, how many, its battery numbers, the Wh and lithium-grams figures its label names, your answers and the rule words found on its label, never the photo or the label text.")).toBeInTheDocument();
    expect(screen.getByText(/Not affiliated with or approved by the US Postal Service/)).toBeInTheDocument();
    // Every model read, on the device or in the cloud, sends its timing record.
    expect(screen.getByText(READ_TIMING_SENT)).toBeInTheDocument();
  });

  it("links the public source code", () => {
    render(<AboutPage />);
    expect(screen.getByRole("link", { name: "Source code on GitHub" })).toHaveAttribute("href", "https://github.com/StephenSook/before-you-tape");
  });

  it("credits every published eval photo, linking each open license and source", () => {
    render(<AboutPage />);
    const credits = within(screen.getByRole("list", { name: "Photo credits" })).getAllByRole("listitem");
    expect(credits).toHaveLength(manifest.items.length);
    const commons = credits.find((c) => c.textContent?.includes("Raimond Spekking"))!;
    expect(within(commons).getByRole("link", { name: "CC BY-SA 4.0" })).toHaveAttribute("href", expect.stringMatching(/^https:\/\/creativecommons\.org\//));
    expect(within(commons).getByRole("link", { name: "source" })).toHaveAttribute("href", expect.stringMatching(/^https:\/\/commons\.wikimedia\.org\//));
    expect(credits.filter((c) => c.textContent?.includes("Photo by the project owner"))).toHaveLength(13);
  });

  // Each photo by its brand-free name: the measured set's own descriptions name brands and makers. The credit itself
  // keeps each creator's name as the license asks, even where an account is named after a company.
  it("names each credited photo without its brand, maker or model", () => {
    render(<AboutPage />);
    const items = within(screen.getByRole("list", { name: "Photo credits" })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(/^Power bank, back label: Photo by the project owner/);
    for (const li of items) {
      const name = (li.textContent ?? "").split(":")[0]!;
      for (const b of BRANDS) expect(brandWord(b).test(name), `${name} names ${b}`).toBe(false);
    }
  });
});
