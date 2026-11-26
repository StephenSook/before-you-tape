import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ed, withUpcoming } from "../../tests/engine/helpers";
import committed from "../../rules/customs-authorities.json";
import { readCustomsAuthorities } from "../rules/customsAuthorities";
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
    render(<RulesPage edition={ed} index={index} reviews={{ listings: {} }} />);
    const ph = screen.getByRole("region", { name: "Philippines" });
    expect(within(ph).getByText(/read from the USPS page on 2026-11-17, not yet checked by a person/)).toBeInTheDocument();
    expect(within(ph).getByText(/No liquids, nothing that turns runny easily/)).toBeInTheDocument();
    expect(within(ph).getByRole("link", { name: "Philippines listing" })).toHaveAttribute("href", "https://pe.usps.com/text/imm/ps_006.htm");
  });

  // rules/reviews.json: two AI reviews of each line and the project owner's approval of the lines as a whole. The page
  // says exactly that, and never that a person checked the lines one by one.
  it("says the lines were checked by two AI reviews and approved by the project owner as a whole", () => {
    render(<RulesPage edition={ed} index={index} />);
    for (const name of ["Canada", "Philippines"]) {
      const region = screen.getByRole("region", { name });
      expect(region).toHaveTextContent("Rules read from the USPS page on 2026-11-17. Each line was checked against the USPS listing by two AI reviews, and approved by the project owner on November 21, 2026, as a whole, not line by line.");
      expect(region).not.toHaveTextContent(/Checked by a person/i);
    }
  });

  it("shows every observation line in full, as each one's reason says", () => {
    render(<RulesPage edition={ed} index={index} />);
    for (const d of Object.values(ed.destinations)) {
      const region = screen.getByRole("region", { name: d.name });
      const notes = d.lines.filter((l) => l.section === "observations");
      expect(notes.length, d.code).toBeGreaterThan(0);
      for (const l of notes) expect(within(region).getByText(l.ourWording), l.lineId).toBeInTheDocument();
    }
  });

  it("names the countries where mail service is suspended, with the date the list was checked", () => {
    render(<RulesPage edition={ed} index={index} />);
    const s = screen.getByRole("region", { name: "Suspended mail service" });
    expect(s).toHaveTextContent("Haiti");
    expect(s).toHaveTextContent(`checked ${ed.suspensions.checkedOn}`);
  });

  it("lists a suspension the post office has announced for a later date, with its start date", () => {
    render(<RulesPage edition={withUpcoming(ed, "CA", "2026-11-29")} index={index} />);
    const s = screen.getByRole("region", { name: "Suspended mail service" });
    expect(s).toHaveTextContent("From November 29, 2026, the post office will not take mail to: Canada.");
    expect(s).not.toHaveTextContent("Congo");
  });

  it("with the shipped rules, lists no announced suspension and no Canada", () => {
    render(<RulesPage edition={ed} index={index} />);
    const s = screen.getByRole("region", { name: "Suspended mail service" });
    expect(s).not.toHaveTextContent("will not take mail to");
    expect(s).not.toHaveTextContent("Canada");
  });

  const customs = readCustomsAuthorities(committed);

  // The country's own customs authority, in its own words, behind a disclosure: no values, no totals.
  it("quotes Canada's customs authority word for word inside a closed disclosure, with its page and read date", () => {
    render(<RulesPage edition={ed} index={index} customs={customs} today="2026-11-21" />);
    const canada = screen.getByRole("heading", { level: 2, name: "Canada" }).closest("section")!;
    const details = within(canada).getByText("Duty and tax, from the Canada Border Services Agency").closest("details")!;
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getByText(/^Mailed items:/)).toHaveTextContent(
      'Mailed items: "Under the provisions of the Postal Imports Remission Order, if someone mails you an item worth CAN$20 or less, there is no duty or tax payable."');
    expect(within(details).getByText(/^Gifts:/)).toHaveTextContent(
      'Gifts: "If you receive an imported gift by mail that is worth CAN$60 or less, you will not have to pay duty and/or tax on it."');
    expect(within(details).getByRole("link", { name: "the Canada Border Services Agency page" })).toHaveAttribute("href", "https://www.cbsa-asfc.gc.ca/import/courier/menu-eng.html");
    expect(details).toHaveTextContent("read 2026-11-21");
    const philippines = screen.getByRole("heading", { level: 2, name: "Philippines" }).closest("section")!;
    expect(within(philippines).queryByText(/Duty and tax/)).toBeNull();
  });

  it("shows no customs lines once they are stale", () => {
    render(<RulesPage edition={ed} index={index} customs={customs} today="2027-01-21" />);
    expect(screen.queryByText(/Duty and tax, from/)).toBeNull();
  });
});

