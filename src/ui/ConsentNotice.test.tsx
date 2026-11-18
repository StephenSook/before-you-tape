import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConsentNotice, CONSENT_SENTENCE } from "./ConsentNotice";

describe("ConsentNotice", () => {
  it("offers two consent choices with the full sentence", async () => {
    const onChoice = vi.fn();
    render(<ConsentNotice onChoice={onChoice} />);
    expect(screen.getByText("To check items when this laptop can't, a cropped photo of the item and the words on its label go to Google's Gemini. Allow?")).toBeInTheDocument();
    expect(CONSENT_SENTENCE).toBe("To check items when this laptop can't, a cropped photo of the item and the words on its label go to Google's Gemini. Allow?");
    await userEvent.click(screen.getByRole("button", { name: "Keep everything on this laptop" }));
    expect(onChoice).toHaveBeenCalledWith(false);
    await userEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(onChoice).toHaveBeenLastCalledWith(true);
  });
});
