import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuestionRow } from "./QuestionRow";

describe("QuestionRow", () => {
  const q = { id: "label_alcohol", text: "Does the label list alcohol?", answers: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }] };

  it("asks one question and sends back the answer chosen", async () => {
    const onAnswer = vi.fn();
    render(<QuestionRow question={q} value={undefined} onAnswer={onAnswer} />);
    expect(screen.getByTestId("question-row")).toHaveTextContent("Does the label list alcohol?");
    await userEvent.click(screen.getByRole("button", { name: "No" }));
    expect(onAnswer).toHaveBeenCalledWith("label_alcohol", "no");
  });

  it("marks the answer already given", () => {
    render(<QuestionRow question={q} value="yes" onAnswer={() => {}} />);
    expect(screen.getByRole("button", { name: "Yes" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "No" })).toHaveAttribute("aria-pressed", "false");
  });
});
