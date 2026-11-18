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
  it("marks reviewed countries and sends the chosen code", async () => {
    const onChange = vi.fn();
    render(<DestinationPicker index={index} reviewed={["CA", "PH"]} value="CA" onChange={onChange} />);
    expect(screen.getByRole("option", { name: "Canada (rules reviewed)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ghana" })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByTestId("destination-picker"), "PH");
    expect(onChange).toHaveBeenCalledWith("PH");
  });

  it("tells the sender to read the listing for a country we have not reviewed", () => {
    render(<DestinationPicker index={index} reviewed={["CA", "PH"]} value="GH" onChange={() => {}} />);
    const notice = screen.getByTestId("live-read-notice");
    expect(notice).toHaveTextContent("We have not reviewed this country. Read its listing before you pack.");
    expect(screen.getByRole("link", { name: "Ghana listing" })).toHaveAttribute("href", "https://pe.usps.com/text/imm/gh.htm");
  });

  it("shows no notice for a reviewed country", () => {
    render(<DestinationPicker index={index} reviewed={["CA", "PH"]} value="CA" onChange={() => {}} />);
    expect(screen.queryByTestId("live-read-notice")).toBeNull();
  });
});
