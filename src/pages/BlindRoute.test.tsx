import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BlindView, type BlindDeps, type BlindSet } from "./BlindRoute";

const set: BlindSet = {
  setId: "set-1",
  destinations: [{ code: "CA", name: "Canada" }],
  items: [{ itemId: "a", photo: "/eval/items/a.jpg", alt: "A bottle of perfume", credit: "Photo by the project owner" }],
};
const deps = (o: Partial<BlindDeps> = {}): BlindDeps => ({
  openSession: vi.fn(async () => ({ setId: "set-1", locked: false })),
  loadSet: vi.fn(async () => set),
  saveCall: vi.fn(async () => {}),
  lockSession: vi.fn(async () => {}),
  ...o,
});

describe("BlindView", () => {
  it("opens the session by its token and shows the set it names", async () => {
    const d = deps();
    render(<BlindView token="tok-1" deps={d} />);
    expect(await screen.findByRole("group", { name: "A bottle of perfume, to Canada" })).toBeInTheDocument();
    expect(d.openSession).toHaveBeenCalledWith("tok-1");
    expect(d.loadSet).toHaveBeenCalledWith("set-1");
  });

  it("saves calls and locks the session under its token", async () => {
    const d = deps();
    render(<BlindView token="tok-1" deps={d} />);
    const g = await screen.findByRole("group", { name: "A bottle of perfume, to Canada" });
    await userEvent.click(within(g).getByRole("button", { name: "Ship" }));
    expect(d.saveCall).toHaveBeenCalledWith("tok-1", { itemId: "a", destination: "CA", call: "ship" });
    await userEvent.click(screen.getByRole("button", { name: "Send my answers" }));
    expect(d.lockSession).toHaveBeenCalledWith("tok-1");
  });

  it("says plainly when the link is not valid, when the check is not ready, or when it cannot connect", async () => {
    const { unmount } = render(<BlindView token="nope" deps={deps({ openSession: vi.fn(async () => null) })} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("This link is not valid.");
    unmount();
    const second = render(<BlindView token="tok-1" deps={deps({ loadSet: vi.fn(async () => null) })} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("This check is not ready yet.");
    second.unmount();
    render(<BlindView token="tok-1" deps={deps({ openSession: vi.fn(async () => { throw new Error("offline"); }) })} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not open this check. Check the connection and reload.");
  });

  it("shows a locked session as finished", async () => {
    render(<BlindView token="tok-1" deps={deps({ openSession: vi.fn(async () => ({ setId: "set-1", locked: true })) })} />);
    expect(await screen.findByText("Thank you. Your answers are in.")).toBeInTheDocument();
  });
});
