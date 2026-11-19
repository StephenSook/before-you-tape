import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JoinView } from "./JoinPage";

const ORIGIN = "https://before-you-tape-2026.web.app";
const KEY = "A".repeat(26);

describe("JoinView", () => {
  it("drops the code from the address at once, joins with the link's box and code, and opens that box", async () => {
    const order: string[] = [];
    const join = vi.fn(async () => { order.push("join"); return { boxId: "box-1", joined: true }; });
    const onJoined = vi.fn();
    render(<JoinView href={`${ORIGIN}/join/box-1.${KEY}`} origin={ORIGIN} join={join} onJoined={onJoined} forget={() => order.push("forget")} />);
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith("box-1"));
    expect(join).toHaveBeenCalledWith("box-1", KEY);
    expect(order).toEqual(["forget", "join"]);
    expect(screen.getByRole("status")).toHaveTextContent("Joining the box.");
  });

  it("says plainly when the link is not a join link, and asks nothing of the server", () => {
    const join = vi.fn();
    const forget = vi.fn();
    render(<JoinView href={`${ORIGIN}/join/not-a-code`} origin={ORIGIN} join={join} onJoined={() => {}} forget={forget} />);
    expect(screen.getByRole("alert")).toHaveTextContent("That is not a join link. Scan the code on the laptop again.");
    expect(join).not.toHaveBeenCalled();
    expect(forget).toHaveBeenCalled();
  });

  it("shows the server's words when the code does not work, with a way back", async () => {
    const join = vi.fn(async () => { throw { code: "functions/deadline-exceeded", message: "That code has run out. Show a new code on the laptop." }; });
    const onJoined = vi.fn();
    render(<JoinView href={`${ORIGIN}/join/box-1.${KEY}`} origin={ORIGIN} join={join} onJoined={onJoined} forget={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("That code has run out. Show a new code on the laptop.");
    expect(screen.getByRole("link", { name: "Check a box on this phone instead" })).toHaveAttribute("href", "/");
    expect(onJoined).not.toHaveBeenCalled();
  });
});
