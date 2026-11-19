import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makeJoinLink } from "../shared/joinLink";
import { PhoneHandoff } from "./PhoneHandoff";

const ORIGIN = "https://before-you-tape-2026.web.app";
const qr = vi.fn(async (text: string) => `<svg data-text="${text.length}"></svg>`);

describe("PhoneHandoff", () => {
  it("shows a QR code of this box's join link, and says it works once, for 10 minutes", async () => {
    const start = vi.fn(async () => ({ key: "A".repeat(26), expiresAt: 600_000 }));
    render(<PhoneHandoff boxId="box-1" start={start} qr={qr} origin={ORIGIN} now={() => 0} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("join-qr").innerHTML).toContain("<svg"));
    expect(start).toHaveBeenCalledWith("box-1");
    expect(qr).toHaveBeenLastCalledWith(makeJoinLink(ORIGIN, "box-1", "A".repeat(26)));
    expect(screen.getByRole("img", { name: "QR code to check this box with your phone" })).toBeInTheDocument();
    expect(screen.getByText("Scan it with your phone's camera. It works once, for 10 minutes.")).toBeInTheDocument();
  });

  it("makes a new code when asked", async () => {
    const keys = ["A".repeat(26), "B".repeat(26)];
    const start = vi.fn(async () => ({ key: keys.shift() as string, expiresAt: 600_000 }));
    render(<PhoneHandoff boxId="box-1" start={start} qr={qr} origin={ORIGIN} now={() => 0} onClose={() => {}} />);
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    await userEvent.click(await screen.findByRole("button", { name: "New code" }));
    await waitFor(() => expect(qr).toHaveBeenLastCalledWith(makeJoinLink(ORIGIN, "box-1", "B".repeat(26))));
  });

  it("says plainly why there is no code, and offers to try again", async () => {
    const start = vi.fn().mockRejectedValueOnce({ code: "functions/permission-denied", message: "Only the laptop that started this box can show a code." })
      .mockResolvedValue({ key: "A".repeat(26), expiresAt: 600_000 });
    render(<PhoneHandoff boxId="box-1" start={start} qr={qr} origin={ORIGIN} now={() => 0} onClose={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Only the laptop that started this box can show a code.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByTestId("join-qr").innerHTML).toContain("<svg"));
  });
});
