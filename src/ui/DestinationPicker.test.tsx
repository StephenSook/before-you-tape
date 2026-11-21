import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DestinationPicker } from "./DestinationPicker";

const index = [
  { code: "CA", name: "Canada", immUrl: "https://pe.usps.com/text/imm/ce_003.htm" },
  { code: "GH", name: "Ghana", immUrl: "https://pe.usps.com/text/imm/gh.htm" },
  { code: "PH", name: "Philippines", immUrl: "https://pe.usps.com/text/imm/ps_006.htm" },
];
const radio = (name: RegExp) => within(screen.getByTestId("destination-picker")).getByRole("radio", { name });

describe("DestinationPicker", () => {
  it("offers each country as a button, marks the chosen one, and sends the code of a press", async () => {
    const onChange = vi.fn();
    render(<DestinationPicker index={index} readBy={{ CA: "person", PH: "usps_page" }} value="CA" onChange={onChange} />);
    expect(screen.getByRole("radiogroup", { name: "Sending to" })).toBe(screen.getByTestId("destination-picker"));
    expect(radio(/Canada/)).toHaveAttribute("aria-checked", "true");
    expect(radio(/Philippines/)).toHaveAttribute("aria-checked", "false");
    await userEvent.click(radio(/Philippines/));
    expect(onChange).toHaveBeenCalledWith("PH");
  });

  it("says who read the chosen country's rules, never more than that, and links the rules page", () => {
    const { rerender } = render(<DestinationPicker index={index} readBy={{ CA: "person", PH: "usps_page" }} value="CA" onChange={() => {}} />);
    expect(screen.getByTestId("rules-read-by")).toHaveTextContent("Rules checked by a person.");
    rerender(<DestinationPicker index={index} readBy={{ CA: "person", PH: "usps_page" }} value="PH" onChange={() => {}} />);
    expect(screen.getByTestId("rules-read-by")).toHaveTextContent("Rules read from the USPS page.");
    expect(within(screen.getByTestId("rules-read-by")).getByRole("link", { name: "See the rules" })).toHaveAttribute("href", "/rules");
    expect(screen.queryByText(/reviewed/)).toBeNull();
  });

  it("shows a country's badge, such as a suspension the post office has announced", () => {
    render(<DestinationPicker index={index} readBy={{ CA: "usps_page" }} value="PH" onChange={() => {}} badges={{ CA: "USPS stops Nov 29" }} />);
    expect(radio(/Canada/)).toHaveTextContent("USPS stops Nov 29");
    expect(radio(/Philippines/)).not.toHaveTextContent("USPS");
  });

  it("marks no country until there is one, and counts a press of the first one", async () => {
    const onChange = vi.fn();
    render(<DestinationPicker index={index} readBy={{ CA: "person" }} value="" onChange={onChange} />);
    for (const name of [/Canada/, /Ghana/, /Philippines/]) expect(radio(name)).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("Choose where the box is going.")).toBeInTheDocument();
    expect(screen.queryByTestId("live-read-notice")).toBeNull();
    await userEvent.click(radio(/Canada/));
    expect(onChange).toHaveBeenCalledWith("CA");
  });

  it("moves between countries with the arrow keys, one tab stop for the group", async () => {
    const onChange = vi.fn();
    render(<DestinationPicker index={index} readBy={{}} value="CA" onChange={onChange} />);
    expect(radio(/Canada/)).toHaveAttribute("tabindex", "0");
    expect(radio(/Ghana/)).toHaveAttribute("tabindex", "-1");
    radio(/Canada/).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("GH");
  });

  it("tells the sender to read the listing for a country we have not reviewed", () => {
    render(<DestinationPicker index={index} readBy={{ CA: "usps_page", PH: "usps_page" }} value="GH" onChange={() => {}} />);
    const notice = screen.getByTestId("live-read-notice");
    expect(notice).toHaveTextContent("We have not reviewed this country. Read its listing before you pack.");
    expect(screen.getByRole("link", { name: "Ghana listing" })).toHaveAttribute("href", "https://pe.usps.com/text/imm/gh.htm");
  });

  it("shows no notice for a reviewed country", () => {
    render(<DestinationPicker index={index} readBy={{ CA: "usps_page", PH: "usps_page" }} value="CA" onChange={() => {}} />);
    expect(screen.queryByTestId("live-read-notice")).toBeNull();
  });
});
