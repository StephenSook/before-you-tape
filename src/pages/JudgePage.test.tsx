import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ed } from "../../tests/engine/helpers";
import { JudgePage } from "./JudgePage";

const index = [
  { code: "CA", name: "Canada", immUrl: "https://pe.usps.com/text/imm/ce_003.htm" },
  { code: "PH", name: "Philippines", immUrl: "https://pe.usps.com/text/imm/ps_006.htm" },
];
const card = (name: string) => screen.getAllByTestId("sample-card").find((c) => within(c).queryByText(name, { selector: ".item-name" }))!;
const verdict = (name: string) => within(card(name)).getByTestId("verdict-chip");

describe("JudgePage", () => {
  it("shows nine real items with their photos and credits, judged for Canada", () => {
    render(<JudgePage edition={ed} index={index} today="2026-11-20" />);
    expect(screen.getByRole("heading", { level: 1, name: "Try the sample box" })).toBeInTheDocument();
    expect(screen.getByText(/no camera, no built-in model and no sign-in/)).toBeInTheDocument();
    expect(screen.getAllByTestId("sample-card")).toHaveLength(9);
    expect(within(card("Body lotion")).getByRole("img")).toHaveAttribute("src", "/eval/items/own-18.jpg");
    expect(within(card("Body lotion")).getByText("Photo by the project owner")).toBeInTheDocument();
    expect(within(card("Power bank")).getByText(/^Photo: .*CC BY-SA 4\.0/)).toBeInTheDocument();
    expect(verdict("Body lotion")).toHaveTextContent("OK to pack");
    expect(verdict("Power bank")).toHaveTextContent("Take it out");
    expect(verdict("Ceramic mug")).toHaveTextContent("OK to pack");
  });

  it("re-checks the whole box for the Philippines with no model call", async () => {
    render(<JudgePage edition={ed} index={index} today="2026-11-20" />);
    await userEvent.selectOptions(screen.getByTestId("destination-picker"), "PH");
    expect(verdict("Body lotion")).toHaveTextContent("Take it out");
    expect(verdict("Dark chocolate bar")).toHaveTextContent("Check this");
    expect(verdict("Ceramic mug")).toHaveTextContent("Check this");
    expect(verdict("Whole-bean coffee")).toHaveTextContent("Check this");
    expect(screen.getByTestId("recheck-line")).toHaveTextContent(/Re-checked 9 items for Philippines in \d+ ms\. 0 model calls\./);
  });

  it("asks what the label cannot show, and the verdict follows the answer", async () => {
    render(<JudgePage edition={ed} index={index} today="2026-11-20" />);
    expect(verdict("Perfume")).toHaveTextContent("Check this");
    const question = within(card("Perfume")).getByRole("group", { name: "Does the label list alcohol?" });
    await userEvent.click(within(question).getByRole("button", { name: "Yes" }));
    expect(verdict("Perfume")).toHaveTextContent("Take it out");
  });

  it("names the rule and its section behind each verdict", () => {
    render(<JudgePage edition={ed} index={index} today="2026-11-20" />);
    const link = within(card("Power bank")).getByRole("link", { name: "Pub 52 622.5" });
    expect(link).toHaveAttribute("href", expect.stringMatching(/^https:\/\/pe\.usps\.com\//));
  });
});
