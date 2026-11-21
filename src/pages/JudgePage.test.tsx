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
  it("shows nine real items with their photos and credits, judged for the Philippines", () => {
    render(<JudgePage edition={ed} index={index} today="2026-11-20" />);
    expect(screen.getByTestId("destination-picker")).toHaveValue("PH");
    expect(screen.getByRole("heading", { level: 1, name: "Try the sample box" })).toBeInTheDocument();
    expect(screen.getByText(/no camera, no built-in model and no sign-in/)).toBeInTheDocument();
    expect(screen.getAllByTestId("sample-card")).toHaveLength(9);
    expect(within(card("Body lotion")).getByRole("img")).toHaveAttribute("src", "/eval/items/own-18.jpg");
    expect(within(card("Body lotion")).getByText("Photo by the project owner")).toBeInTheDocument();
    expect(within(card("Power bank")).getByText(/^Photo: .*CC BY-SA 4\.0/)).toBeInTheDocument();
    expect(verdict("Body lotion")).toHaveTextContent("Take it out");
    expect(verdict("Power bank")).toHaveTextContent("Take it out");
    expect(verdict("Dark chocolate bar")).toHaveTextContent("Check this");
    expect(verdict("Ceramic mug")).toHaveTextContent("Check this");
    expect(verdict("Whole-bean coffee")).toHaveTextContent("Check this");
  });

  it("re-checks the whole box for Canada with no model call", async () => {
    render(<JudgePage edition={ed} index={index} today="2026-11-20" />);
    await userEvent.selectOptions(screen.getByTestId("destination-picker"), "CA");
    expect(verdict("Body lotion")).toHaveTextContent("OK to pack");
    expect(verdict("Power bank")).toHaveTextContent("Take it out");
    expect(verdict("Ceramic mug")).toHaveTextContent("OK to pack");
    expect(screen.getByTestId("recheck-line")).toHaveTextContent(/Re-checked 9 items for Canada in \d+ ms\. 0 model calls\./);
  });

  it("shows the post office's Canada suspension as a live example, before and after it starts", async () => {
    const { unmount } = render(<JudgePage edition={ed} index={index} today="2026-11-20" />);
    expect(screen.getByTestId("suspension-example")).toHaveTextContent("USPS stops taking mail to Canada on November 29, 2026. Pick Canada to see the app say so.");
    expect(screen.queryByTestId("suspension-ahead-banner")).toBeNull();
    await userEvent.selectOptions(screen.getByTestId("destination-picker"), "CA");
    expect(screen.getByTestId("suspension-ahead-banner")).toHaveTextContent("The post office stops taking mail to Canada on November 29, 2026. Mail this box before then.");
    unmount();
    render(<JudgePage edition={ed} index={index} today="2026-11-29" />);
    expect(screen.getByTestId("suspension-example")).toHaveTextContent("USPS stopped taking mail to Canada on November 29, 2026. Pick Canada to see the app say so.");
    await userEvent.selectOptions(screen.getByTestId("destination-picker"), "CA");
    expect(verdict("Body lotion")).toHaveTextContent("Check this");
    expect(within(card("Body lotion")).getByText(/Mail to Canada is suspended right now/)).toBeInTheDocument();
    expect(screen.queryByTestId("suspension-ahead-banner")).toBeNull();
  });

  it("asks what the label cannot show, and the verdict follows the answer", async () => {
    render(<JudgePage edition={ed} index={index} today="2026-11-20" />);
    // In the Philippines perfume (a liquid in glass) is out whatever the label says; Canada asks.
    await userEvent.selectOptions(screen.getByTestId("destination-picker"), "CA");
    expect(verdict("Perfume")).toHaveTextContent("Check this");
    const question = within(card("Perfume")).getByRole("group", { name: "Does the label list alcohol?" });
    await userEvent.click(within(question).getByRole("button", { name: "Yes" }));
    expect(verdict("Perfume")).toHaveTextContent("Take it out");
  });

  it("says plainly that cloud checks stay off when the browser blocks Firebase settings", () => {
    render(<JudgePage edition={ed} index={index} today="2026-11-20" />);
    expect(screen.getByTestId("cloud-settings-note")).toHaveTextContent("If your browser blocks Firebase settings, cloud checks stay off. Checks on this device still work.");
  });

  it("shows recorded on-device reads only from a record it is given, closed, and says it is a replay", () => {
    const recorded = { ranAt: "2026-11-21T10:00:00.000Z", sha: "a".repeat(40), chromeVersion: "157.0.8103.80", os: "macOS 27.0",
      reads: [{ itemId: "own-18", category: "lotion_cream", ms: 2900 }, { itemId: "own-01", category: "power_bank", ms: 3100 }] };
    const { unmount } = render(<JudgePage edition={ed} index={index} today="2026-11-21" recorded={recorded} />);
    const block = screen.getByTestId("recorded-reads");
    expect(block.tagName).toBe("DETAILS");
    expect(block).not.toHaveAttribute("open");
    expect(within(block).getByText("Recorded on-device reads")).toBeInTheDocument();
    expect(block).toHaveTextContent("Recorded November 21, 2026, Chrome 157.0.8103.80 on macOS 27.0. A replay, not a live read.");
    expect(within(block).getAllByRole("listitem")).toHaveLength(2);
    // The first read also starts the model, so its time is marked and never reads as a typical one.
    expect(within(block).getAllByRole("listitem")[0]).toHaveTextContent("2,900 ms (first read, includes the model's start)");
    expect(within(block).getAllByRole("listitem")[1]).toHaveTextContent("3,100 ms");
    expect(within(block).getAllByRole("listitem")[1]).not.toHaveTextContent("first read");
    unmount();
    const withMachine = { ...recorded, machine: { model: "Mac17,9", chip: "Apple M5 Pro", memoryGb: 48 } };
    const second = render(<JudgePage edition={ed} index={index} today="2026-11-21" recorded={withMachine} />);
    expect(screen.getByTestId("recorded-reads")).toHaveTextContent("Chrome 157.0.8103.80 on macOS 27.0, Apple M5 Pro, 48 GB memory (Mac17,9).");
    second.unmount();
    render(<JudgePage edition={ed} index={index} today="2026-11-21" recorded={null} />);
    expect(screen.queryByTestId("recorded-reads")).toBeNull();
  });

  it("links the public source code", () => {
    render(<JudgePage edition={ed} index={index} today="2026-11-20" />);
    expect(screen.getByRole("link", { name: "Source code on GitHub" })).toHaveAttribute("href", "https://github.com/StephenSook/before-you-tape");
  });

  it("names the rule and its section behind each verdict", () => {
    render(<JudgePage edition={ed} index={index} today="2026-11-20" />);
    const link = within(card("Power bank")).getByRole("link", { name: "Pub 52 622.5" });
    expect(link).toHaveAttribute("href", expect.stringMatching(/^https:\/\/pe\.usps\.com\//));
  });

  it("shows matched pairs below the country picker, judged for the country picked", async () => {
    const read = { itemName: "Phone", category: "phone" as const, labelText: "LI-ION 3.85V 4000mAh 15.4Wh", volts: 3.85, milliampHours: 4000,
      wattHours: 15.4, lithiumGrams: 0, batteryWords: true, liquid: false, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false,
      glassContainer: false, powder: false, retailBox: "sealed" as const, evidence: "label_read" as const };
    const side = (label: string, answer: string) => ({ label, photo: "/eval/items/i06.jpg", width: 1200, height: 1600, photoAlt: label,
      credit: "Photo by the project owner", read, answers: { device_condition: answer } });
    render(<JudgePage edition={ed} index={index} today="2026-11-20" pairs={[{ id: "p", title: "Same phone", left: side("New", "new_sealed"), right: side("Used", "used") }]} />);
    const pair = screen.getByTestId("matched-pair");
    expect(within(pair).getAllByTestId("verdict-chip").map((c) => c.textContent)).toEqual(["OK to pack", "Take it out"]);
    await userEvent.selectOptions(screen.getByTestId("destination-picker"), "CA");
    expect(within(screen.getByTestId("matched-pair")).getAllByTestId("verdict-chip").map((c) => c.textContent)).toEqual(["OK to pack", "Take it out"]);
  });

  it("shows no matched pairs section while none is listed", () => {
    render(<JudgePage edition={ed} index={index} today="2026-11-20" />);
    expect(screen.queryByTestId("matched-pair")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Same item, one thing different" })).toBeNull();
  });
});

