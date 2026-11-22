import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConsentNotice, CONSENT_SENTENCE } from "./ConsentNotice";

describe("ConsentNotice", () => {
  it("offers two consent choices with the full sentence", async () => {
    const onChoice = vi.fn();
    render(<ConsentNotice onChoice={onChoice} />);
    expect(screen.getByText(CONSENT_SENTENCE)).toBeInTheDocument();
    // It covers the second look too: a photo already read on this device can go to the cloud after Allow.
    expect(CONSENT_SENTENCE).toBe("To read items this device can't, and to check a read again when the rules ask, the cropped photo goes to Google's Gemini. Allow?");
    // The box list still saves the category, battery numbers and answers, so the choice is about checking only.
    expect(screen.queryByRole("button", { name: /Keep everything/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Check on this device only" }));
    expect(onChoice).toHaveBeenCalledWith(false);
    await userEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(onChoice).toHaveBeenLastCalledWith(true);
  });
});
