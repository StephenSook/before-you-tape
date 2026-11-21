import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ed } from "../../tests/engine/helpers";
import type { MatchedPair } from "../judge/matchedPairs";
import { MATCHED_PAIRS } from "../judge/matchedPairs";
import type { ItemRead } from "../shared/itemRead";
import { MatchedPairs } from "./MatchedPairs";

const phone: ItemRead = {
  itemName: "Phone", category: "phone", labelText: "LI-ION 3.85V 4000mAh 15.4Wh", volts: 3.85, milliampHours: 4000, wattHours: 15.4,
  lithiumGrams: 0, batteryWords: true, liquid: false, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false,
  glassContainer: false, powder: false, retailBox: "sealed", evidence: "label_read",
};
const side = (label: string, answer: string, retailBox: ItemRead["retailBox"]) => ({
  label, photo: "/eval/items/i06.jpg", width: 1200, height: 1600, photoAlt: "A phone", credit: "Photo by the project owner",
  read: { ...phone, retailBox }, answers: { device_condition: answer },
});
const pair: MatchedPair = { id: "phone", title: "The same phone, new in its box or used", left: side("New, in its sealed box", "new_sealed", "sealed"), right: side("Used", "used", "open_or_none") };

describe("MatchedPairs", () => {
  it("shows nothing when no pair is given", () => {
    const { container } = render(<MatchedPairs pairs={[]} edition={ed} destinationCode="PH" today="2026-11-21" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists one real pair today: the published lotion photo, sent to Canada and to the Philippines", () => {
    expect(MATCHED_PAIRS.map((p) => p.id)).toEqual(["lotion-two-countries"]);
    const [lotion] = MATCHED_PAIRS;
    expect([lotion!.left.photo, lotion!.right.photo]).toEqual(["/eval/items/own-18.jpg", "/eval/items/own-18.jpg"]);
    expect([lotion!.left.destination, lotion!.right.destination]).toEqual(["CA", "PH"]);
    // The stated size is the published file's own, read from its JPEG frame header.
    const jpeg = readFileSync(join(process.cwd(), "public", lotion!.left.photo));
    let i = 2;
    while (jpeg[i + 1] !== 0xc0 && jpeg[i + 1] !== 0xc2) i += 2 + jpeg.readUInt16BE(i + 2);
    expect({ width: jpeg.readUInt16BE(i + 7), height: jpeg.readUInt16BE(i + 5) }).toEqual({ width: lotion!.left.width, height: lotion!.left.height });
  });

  it("judges a side fixed to a country for that country, whatever the page has picked", () => {
    render(<MatchedPairs pairs={MATCHED_PAIRS} edition={ed} destinationCode="PH" today="2026-11-21" />);
    const sides = screen.getAllByTestId("pair-side");
    expect(within(sides[0]!).getByText("To Canada")).toBeInTheDocument();
    expect(within(sides[0]!).getByTestId("verdict-chip")).toHaveTextContent("OK to pack");
    expect(within(sides[1]!).getByText("To the Philippines")).toBeInTheDocument();
    expect(within(sides[1]!).getByTestId("verdict-chip")).toHaveTextContent("Take it out");
  });

  it("judges each side with the app's own rules, and names the rule that decides it", () => {
    render(<MatchedPairs pairs={[pair]} edition={ed} destinationCode="PH" today="2026-11-21" />);
    const sides = within(screen.getByTestId("matched-pair")).getAllByTestId("pair-side");
    expect(sides).toHaveLength(2);
    expect(within(sides[0]!).getByText("New, in its sealed box")).toBeInTheDocument();
    // Typed numbers wait for a second look (USPS-INTL-LI-ONE-READ), so the new phone is Check this, not OK.
    expect(within(sides[0]!).getByTestId("verdict-chip")).toHaveTextContent("Check this");
    expect(within(sides[1]!).getByTestId("verdict-chip")).toHaveTextContent("Take it out");
    expect(within(sides[1]!).getByTestId("pair-reason")).toHaveTextContent("Used devices with lithium batteries can't go by international mail.");
    expect(within(sides[1]!).getByRole("img", { name: "A phone" })).toHaveAttribute("width");
  });

  it("judges each side on its own answers", () => {
    // Opened against sealed, by the answer alone (both photos read sealed), so each side's rule comes from its answer.
    const answers: MatchedPair = { id: "opened", title: "The same phone, new, opened or sealed",
      left: side("New, box opened", "new_opened", "sealed"), right: side("New, in its sealed box", "new_sealed", "sealed") };
    render(<MatchedPairs pairs={[answers]} edition={ed} destinationCode="CA" today="2026-11-21" />);
    const sides = within(screen.getByTestId("matched-pair")).getAllByTestId("pair-side");
    expect(within(sides[0]!).getByTestId("pair-reason")).toHaveTextContent("Pack this one back in its own box.");
    expect(within(sides[1]!).getByTestId("pair-reason")).toHaveTextContent("Check the battery numbers on the label.");
  });
});
