import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DestinationPicker } from "./DestinationPicker";

const index = [
  { code: "CA", name: "Canada", immUrl: "https://pe.usps.com/text/imm/ce_003.htm" },
  { code: "GH", name: "Ghana", immUrl: "https://pe.usps.com/text/imm/gh.htm" },
  { code: "PH", name: "Philippines", immUrl: "https://pe.usps.com/text/imm/ps_006.htm" },
];

describe("DestinationPicker", () => {
  it("says who read each country's rules, never more than that, and sends the chosen code", async () => {
    const onChange = vi.fn();
    render(<DestinationPicker index={index} readBy={{ CA: "person", PH: "usps_page" }} value="CA" onChange={onChange} />);
    expect(screen.getByRole("option", { name: "Canada (rules checked by a person)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Philippines (rules read from the USPS page)" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /reviewed/ })).toBeNull();
    expect(screen.getByRole("option", { name: "Ghana" })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByTestId("destination-picker"), "PH");
    expect(onChange).toHaveBeenCalledWith("PH");
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
