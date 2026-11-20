import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ed } from "../../tests/engine/helpers";
import { RulesPage } from "./RulesPage";

const index = [
  { code: "CA", name: "Canada", immUrl: "https://pe.usps.com/text/imm/ce_003.htm" },
  { code: "PH", name: "Philippines", immUrl: "https://pe.usps.com/text/imm/ps_006.htm" },
];

describe("RulesPage", () => {
  it("lists every USPS export rule in our words, with its outcome and a link to its section", () => {
    render(<RulesPage edition={ed} index={index} />);
    expect(screen.getByRole("heading", { level: 1, name: "Rules" })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Rule edition ${ed.editionId}`))).toBeInTheDocument();
    const usps = screen.getByRole("list", { name: "US Postal Service rules" });
    const exportRules = new Set(ed.rules.filter((r) => r.layer === "usps_export").map((r) => r.id));
    expect(within(usps).getAllByRole("listitem")).toHaveLength(exportRules.size);
    const aerosol = within(usps).getByText(/Aerosols and other items under pressure/).closest("li")!;
    expect(within(aerosol).getByText("Take it out")).toBeInTheDocument();
    expect(within(aerosol).getByRole("link", { name: /Pub 52 623/ })).toHaveAttribute("href", expect.stringMatching(/^https:\/\/pe\.usps\.com\//));
  });

  it("gives each country's lines and says who read them", () => {
    render(<RulesPage edition={ed} index={index} />);
    const ph = screen.getByRole("region", { name: "Philippines" });
    expect(within(ph).getByText(/read from the USPS page on 2026-11-17, not yet checked by a person/)).toBeInTheDocument();
    expect(within(ph).getByText(/No liquids, nothing that turns runny easily/)).toBeInTheDocument();
    expect(within(ph).getByRole("link", { name: "Philippines listing" })).toHaveAttribute("href", "https://pe.usps.com/text/imm/ps_006.htm");
  });

  it("names the countries where mail service is suspended, with the date the list was checked", () => {
    render(<RulesPage edition={ed} index={index} />);
    const s = screen.getByRole("region", { name: "Suspended mail service" });
    expect(s).toHaveTextContent("Haiti");
    expect(s).toHaveTextContent(`checked ${ed.suspensions.checkedOn}`);
  });

  it("lists a suspension the post office has announced for a later date, with its start date", () => {
    render(<RulesPage edition={ed} index={index} />);
    const s = screen.getByRole("region", { name: "Suspended mail service" });
    expect(s).toHaveTextContent("From November 29, 2026, the post office will not take mail to: Canada.");
    expect(s).not.toHaveTextContent("Congo");
  });
});
