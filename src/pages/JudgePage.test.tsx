import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ed } from "../../tests/engine/helpers";
import { SAMPLE_READ } from "../data/sampleRead";
import type { LiveReadDeps } from "../judge/LiveReadPanel";
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
    expect(within(screen.getByTestId("destination-picker")).getByRole("radio", { name: /^Philippines/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("heading", { level: 1, name: "Try the sample box" })).toBeInTheDocument();
    expect(screen.getByText(/no camera, no built-in model and no sign-in/)).toBeInTheDocument();
    expect(screen.getAllByTestId("sample-card")).toHaveLength(9);
    // A small WebP copy, with its size, so the page loads fast and does not shift as photos arrive.
    const img = within(card("Body lotion")).getByRole("img");
    expect(img).toHaveAttribute("src", "/eval/thumbs/own-18-480.webp");
    expect(img).toHaveAttribute("srcset", "/eval/thumbs/own-18-240.webp 240w, /eval/thumbs/own-18-480.webp 480w");
    expect(img).toHaveAttribute("sizes", "(max-width: 700px) 50vw, 240px");
    expect([img.getAttribute("width"), img.getAttribute("height")]).toEqual(["480", "640"]);
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
    await userEvent.click(within(screen.getByTestId("destination-picker")).getByRole("radio", { name: /^Canada/ }));
    expect(verdict("Body lotion")).toHaveTextContent("OK to pack");
    expect(verdict("Power bank")).toHaveTextContent("Take it out");
    expect(verdict("Ceramic mug")).toHaveTextContent("OK to pack");
    expect(screen.getByTestId("recheck-line")).toHaveTextContent(/Re-checked 9 items for Canada in \d+ ms\. 0 model calls\./);
  });

  it("shows the post office's Canada suspension as a live example, before and after it starts", async () => {
    const { unmount } = render(<JudgePage edition={ed} index={index} today="2026-11-20" />);
    expect(screen.getByTestId("suspension-example")).toHaveTextContent("USPS stops taking mail to Canada on November 29, 2026. Pick Canada to see the app say so.");
    expect(screen.queryByTestId("suspension-ahead-banner")).toBeNull();
    await userEvent.click(within(screen.getByTestId("destination-picker")).getByRole("radio", { name: /^Canada/ }));
    expect(screen.getByTestId("suspension-ahead-banner")).toHaveTextContent("The post office stops taking mail to Canada on November 29, 2026. Mail this box before then.");
    unmount();
    render(<JudgePage edition={ed} index={index} today="2026-11-29" />);
    expect(screen.getByTestId("suspension-example")).toHaveTextContent("USPS stopped taking mail to Canada on November 29, 2026. Pick Canada to see the app say so.");
    await userEvent.click(within(screen.getByTestId("destination-picker")).getByRole("radio", { name: /^Canada/ }));
    expect(verdict("Body lotion")).toHaveTextContent("Check this");
    expect(within(card("Body lotion")).getByText(/Mail to Canada is suspended right now/)).toBeInTheDocument();
    expect(screen.queryByTestId("suspension-ahead-banner")).toBeNull();
  });

  it("asks what the label cannot show, and the verdict follows the answer", async () => {
    render(<JudgePage edition={ed} index={index} today="2026-11-20" />);
    // In the Philippines perfume (a liquid in glass) is out whatever the label says; Canada asks.
    await userEvent.click(within(screen.getByTestId("destination-picker")).getByRole("radio", { name: /^Canada/ }));
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
    expect(screen.getByRole("link", { name: "Android app (APK)" })).toHaveAttribute("href", "https://github.com/StephenSook/before-you-tape/releases/tag/android-judge-3");
  });

  it("names the rule and its section behind each verdict", () => {
    render(<JudgePage edition={ed} index={index} today="2026-11-20" />);
    const link = within(card("Power bank")).getByRole("link", { name: "Pub 52 622.5" });
    expect(link).toHaveAttribute("href", expect.stringMatching(/^https:\/\/pe\.usps\.com\//));
  });

  it("marks Canada in the country buttons with the suspension the post office has announced", () => {
    render(<JudgePage edition={ed} index={index} today="2026-11-20" />);
    expect(within(screen.getByTestId("destination-picker")).getByRole("radio", { name: /^Canada/ })).toHaveTextContent("USPS stops Nov 29");
  });

  it("lays the cards out in a grid, the verdict on each photo, the label and credit behind a disclosure", () => {
    render(<JudgePage edition={ed} index={index} today="2026-11-20" />);
    const grid = screen.getByTestId("sample-grid");
    expect(within(grid).getAllByTestId("sample-card")).toHaveLength(9);
    const c = card("Body lotion");
    // The chip sits on the photo's corner: both in one photo box.
    const photo = within(c).getByRole("img").parentElement!;
    expect(photo).toHaveClass("sample-photo");
    expect(within(photo).getByTestId("verdict-chip")).toBeInTheDocument();
    const more = within(c).getByText("Label and photo credit").closest("details")!;
    expect(more).not.toHaveAttribute("open");
    expect(within(more).getByText(/^Label:/)).toBeInTheDocument();
    expect(within(more).getByText("Photo by the project owner")).toBeInTheDocument();
  });

  it("shows matched pairs below the country picker, judged for the country picked", async () => {
    const read = { itemName: "Phone", category: "phone" as const, labelText: "LI-ION 3.85V 4000mAh 15.4Wh", volts: 3.85, milliampHours: 4000,
      wattHours: 15.4, lithiumGrams: 0, batteryWords: true, liquid: false, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false,
      glassContainer: false, powder: false, retailBox: "sealed" as const, evidence: "label_read" as const };
    const side = (label: string, answer: string) => ({ label, photo: "/eval/items/i06.jpg", width: 1200, height: 1600, photoAlt: label,
      credit: "Photo by the project owner", read, answers: { device_condition: answer } });
    render(<JudgePage edition={ed} index={index} today="2026-11-20" pairs={[{ id: "p", title: "Same phone", left: side("New", "new_sealed"), right: side("Used", "used") }]} />);
    // The new phone's typed numbers wait for a second look (USPS-INTL-LI-ONE-READ); the used one is out either way.
    const pair = screen.getByTestId("matched-pair");
    expect(within(pair).getAllByTestId("verdict-chip").map((c) => c.textContent)).toEqual(["Check this", "Take it out"]);
    await userEvent.click(within(screen.getByTestId("destination-picker")).getByRole("radio", { name: /^Canada/ }));
    expect(within(screen.getByTestId("matched-pair")).getAllByTestId("verdict-chip").map((c) => c.textContent)).toEqual(["Check this", "Take it out"]);
  });

  it("shows no matched pairs section when none is given", () => {
    render(<JudgePage edition={ed} index={index} today="2026-11-20" pairs={[]} />);
    expect(screen.queryByTestId("matched-pair")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Same item, one thing different" })).toBeNull();
  });

  it("never says a card's question twice: a reason that only restates the question is left out", () => {
    render(<JudgePage edition={ed} index={index} today="2026-11-20" />);
    const phone = card("Smartphone");
    expect(within(phone).queryByText(/^Is it new\? Answer to finish this check\./)).toBeNull();
    expect(within(phone).getAllByText("Is it new?")).toHaveLength(1);
    // The reason that says more than the question stays.
    expect(within(phone).getByText(/We can't see the battery rating through the box/)).toBeInTheDocument();
  });

  it("offers one live read below the sample box, which loads nothing until it is pressed", () => {
    const liveRead = vi.fn();
    render(<JudgePage edition={ed} index={index} today="2026-11-20" liveRead={liveRead} />);
    expect(screen.getByRole("button", { name: "Run one live read" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Run one live read" })).toHaveAttribute("href", "#live-read");
    expect(liveRead).not.toHaveBeenCalled();
  });

  it("judges the live read for the country picked, and again when the country changes", async () => {
    const reply = { generate: vi.fn(async () => ({ text: JSON.stringify(SAMPLE_READ.read), source: "on_device" as const })) };
    const deps: LiveReadDeps = {
      gate: async () => "available", consent: { get: () => true, set: () => {} }, paused: async () => false,
      models: () => ({ device: reply, hybrid: reply, cloud: reply }), sample: async () => ({ mimeType: "image/jpeg", base64: "/9j/AAAA" }),
    };
    render(<JudgePage edition={ed} index={index} today="2026-11-20" liveRead={async () => deps} />);
    await userEvent.click(screen.getByRole("button", { name: "Run one live read" }));
    const result = await screen.findByTestId("live-read-result");
    expect(within(result).getByTestId("verdict-chip")).toHaveTextContent("Take it out");
    await userEvent.click(within(screen.getByTestId("destination-picker")).getByRole("radio", { name: /^Canada/ }));
    expect(within(screen.getByTestId("live-read-result")).getByTestId("verdict-chip")).toHaveTextContent("OK to pack");
  });
});

