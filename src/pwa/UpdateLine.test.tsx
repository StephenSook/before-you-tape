import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetUpdate, markUpdateReady } from "./update";
import { UpdateLine } from "./UpdateLine";

afterEach(() => forgetUpdate());

describe("UpdateLine", () => {
  it("shows nothing until a new version is waiting", () => {
    render(<UpdateLine />);
    expect(screen.queryByText(/new version/)).toBeNull();
  });

  // An open page is never reloaded under the visitor: the new version waits for their tap.
  it("says a new version is ready, and reloads only when Reload is pressed", async () => {
    const reload = vi.fn(async () => {});
    render(<UpdateLine />);
    act(() => markUpdateReady(reload));
    expect(screen.getByRole("status")).toHaveTextContent("A new version is ready. Reload");
    expect(reload).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
