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
  it("shows nothing until a real pair exists", () => {
    const { container } = render(<MatchedPairs pairs={[]} edition={ed} destinationCode="PH" today="2026-11-21" />);
    expect(container).toBeEmptyDOMElement();
    // No pair is listed until the project owner's own photos are in the repo.
    expect(MATCHED_PAIRS).toEqual([]);
  });

  it("judges each side with the app's own rules, and names the rule that decides it", () => {
    render(<MatchedPairs pairs={[pair]} edition={ed} destinationCode="PH" today="2026-11-21" />);
    const sides = within(screen.getByTestId("matched-pair")).getAllByTestId("pair-side");
    expect(sides).toHaveLength(2);
    expect(within(sides[0]!).getByText("New, in its sealed box")).toBeInTheDocument();
    expect(within(sides[0]!).getByTestId("verdict-chip")).toHaveTextContent("OK to pack");
    expect(within(sides[1]!).getByTestId("verdict-chip")).toHaveTextContent("Take it out");
    expect(within(sides[1]!).getByTestId("pair-reason")).toHaveTextContent("Used devices with lithium batteries can't go by international mail.");
    expect(within(sides[1]!).getByRole("img", { name: "A phone" })).toHaveAttribute("width");
  });
});
