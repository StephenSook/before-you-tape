import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DeadlineClock, daysLeft, type HolidayDate } from "./DeadlineClock";

const date: HolidayDate = {
  service: "priority_mail_international",
  region: "Europe",
  dateIso: "2026-12-09",
  sourceUrl: "https://www.usps.com/holiday/",
  checkedOn: "2026-11-18",
};
const earlierDate: HolidayDate = { ...date, region: "Asia", dateIso: "2026-12-03" };
const now = new Date(2026, 10, 25, 12);

describe("daysLeft", () => {
  it("counts from the sender's local calendar date", () => {
    const senderTime = new Date("2026-11-25T12:00:00-05:00");
    expect(daysLeft("2026-12-09", senderTime)).toBe(
      senderTime.getDate() === 25 ? 14 : 13,
    );
    expect(daysLeft("2026-12-09", now)).toBe(14);
  });

  it("counts one calendar day across the fall daylight-saving change", () => {
    expect(daysLeft("2026-11-02", new Date(2026, 10, 1, 0, 30))).toBe(1);
  });

  it("counts one calendar day across the spring daylight-saving change", () => {
    expect(daysLeft("2026-03-09", new Date(2026, 2, 8, 0, 30))).toBe(1);
  });

  it("returns zero on the date and a negative number after it", () => {
    expect(daysLeft("2026-12-09", new Date(2026, 11, 9, 23))).toBe(0);
    expect(daysLeft("2026-12-09", new Date(2026, 11, 10))).toBe(-1);
  });
});

describe("DeadlineClock", () => {
  it("renders nothing without holiday dates", () => {
    expect(render(<DeadlineClock dates={[]} now={now} />).container).toBeEmptyDOMElement();
  });

  it("renders the date and links to the USPS source in a new tab", () => {
    render(<DeadlineClock dates={[date]} now={now} />);

    const link = screen.getByRole("link", { name: "USPS holiday dates" });
    expect(link).toHaveAttribute("href", date.sourceUrl);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    const time = screen.getByText("Wed, Dec 9");
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("datetime", date.dateIso);
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("days left to the recommended Priority Mail International date")).toBeInTheDocument();
  });

  it("shows the last-day message on the recommended date", () => {
    const { container } = render(<DeadlineClock dates={[date]} now={new Date(2026, 11, 9, 12)} />);

    expect(container.querySelector(".deadline-clock__days")).toBeNull();
    expect(screen.getByText("Today is the recommended last day for Priority Mail International")).toBeInTheDocument();
  });

  it("renders nothing when the configured date is not a real date", () => {
    for (const dateIso of ["", "2026-13-40", "Dec 9", "2026-12-9"]) {
      const { container, unmount } = render(<DeadlineClock dates={[{ ...date, dateIso }]} now={now} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("renders nothing after the recommended date", () => {
    const { container } = render(<DeadlineClock dates={[date]} now={new Date(2026, 11, 10)} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("uses day in the singular when one day is left", () => {
    render(<DeadlineClock dates={[date]} now={new Date(2026, 11, 8, 12)} />);

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("day left to the recommended Priority Mail International date")).toBeInTheDocument();
  });

  it("chooses the earliest date when no region is given", () => {
    render(<DeadlineClock dates={[date, earlierDate]} now={now} />);

    expect(screen.getByText("Thu, Dec 3")).toHaveAttribute("datetime", earlierDate.dateIso);
  });

  it("chooses the date for the requested region", () => {
    render(<DeadlineClock dates={[earlierDate, date]} now={now} region="Europe" />);

    expect(screen.getByText("Wed, Dec 9")).toHaveAttribute("datetime", date.dateIso);
  });

  it("renders nothing when the requested region has no date", () => {
    const { container } = render(<DeadlineClock dates={[date]} now={now} region="Canada" />);

    expect(container).toBeEmptyDOMElement();
  });
});
