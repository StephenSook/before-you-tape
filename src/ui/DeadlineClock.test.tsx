import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HolidayDate } from "../config/holidayDates";
import { DeadlineClock, daysLeft } from "./DeadlineClock";

const d: HolidayDate = { service: "Priority Mail International", sendBy: "2026-12-09", deliverBy: "2026-12-25", sourceUrl: "https://www.usps.com/holiday/holiday-shipping-dates.htm", checkedOn: "2026-11-21" };
const open = { name: "Philippines", suspended: false, suspendsFrom: null };
const now = new Date(2026, 10, 21, 12, 0);

describe("daysLeft", () => {
  it("counts whole days from this device's date", () => {
    expect(daysLeft("2026-12-09", new Date(2026, 10, 25, 12, 0))).toBe(14);
    expect(daysLeft("2026-12-09", new Date(2026, 11, 9, 23, 59))).toBe(0);
    expect(daysLeft("2026-12-09", new Date(2026, 11, 10, 0, 1))).toBe(-1);
  });
});

describe("DeadlineClock", () => {
  it("says how many days are left to mail for the holiday, and links the USPS page", () => {
    render(<DeadlineClock dates={[d]} now={now} destination={open} />);
    expect(screen.getByTestId("deadline-clock")).toHaveTextContent(
      "USPS suggests mailing by December 9 for December 25 (Priority Mail International): 18 days left. USPS holiday dates");
    expect(screen.getByRole("link", { name: "USPS holiday dates" })).toHaveAttribute("href", d.sourceUrl);
  });

  it("says one day, and today, plainly", () => {
    const { rerender } = render(<DeadlineClock dates={[d]} now={new Date(2026, 11, 8, 9, 0)} destination={open} />);
    expect(screen.getByTestId("deadline-clock")).toHaveTextContent("(Priority Mail International): 1 day left.");
    rerender(<DeadlineClock dates={[d]} now={new Date(2026, 11, 9, 9, 0)} destination={open} />);
    expect(screen.getByTestId("deadline-clock")).toHaveTextContent("USPS suggests mailing by today, December 9, for December 25 (Priority Mail International).");
  });

  it("shows nothing with no dates, or once the date has passed", () => {
    expect(render(<DeadlineClock dates={[]} now={now} destination={open} />).container).toBeEmptyDOMElement();
    expect(render(<DeadlineClock dates={[d]} now={new Date(2026, 11, 10, 9, 0)} destination={open} />).container).toBeEmptyDOMElement();
  });

  // A suspension that starts first is the date that counts, and the destination note already says it.
  it("shows nothing when mail to the country is suspended, or stops on or before the mailing date", () => {
    expect(render(<DeadlineClock dates={[d]} now={now} destination={{ name: "Canada", suspended: true, suspendsFrom: null }} />).container).toBeEmptyDOMElement();
    expect(render(<DeadlineClock dates={[d]} now={now} destination={{ name: "Canada", suspended: false, suspendsFrom: "2026-11-29" }} />).container).toBeEmptyDOMElement();
    expect(render(<DeadlineClock dates={[d]} now={now} destination={{ name: "Canada", suspended: false, suspendsFrom: "2026-12-09" }} />).container).toBeEmptyDOMElement();
    render(<DeadlineClock dates={[d]} now={now} destination={{ name: "Canada", suspended: false, suspendsFrom: "2026-12-10" }} />);
    expect(screen.getByTestId("deadline-clock")).toHaveTextContent("18 days left");
  });

  it("shows the earliest date still to come when there are several", () => {
    const express = { ...d, service: "Priority Mail Express International", sendBy: "2026-12-16" };
    render(<DeadlineClock dates={[express, d]} now={new Date(2026, 11, 12, 9, 0)} destination={open} />);
    expect(screen.getByTestId("deadline-clock")).toHaveTextContent("mailing by December 16 for December 25 (Priority Mail Express International): 4 days left.");
  });
});
