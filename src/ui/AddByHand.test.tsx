import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddByHand } from "./AddByHand";

describe("AddByHand", () => {
  it("adds by hand", async () => {
    const onAdd = vi.fn();
    render(<AddByHand onAdd={onAdd} />);
    await userEvent.selectOptions(screen.getByLabelText("What is it?"), "lotion_cream");
    await userEvent.click(screen.getByLabelText("It is a liquid"));
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onAdd.mock.calls[0]![0]).toMatchObject({ category: "lotion_cream", liquid: true, evidence: "item_seen" });
  });

  it("names the item from what the sender typed, or from its kind, and keeps the typed label and numbers", async () => {
    const onAdd = vi.fn();
    render(<AddByHand onAdd={onAdd} />);
    await userEvent.selectOptions(screen.getByLabelText("What is it?"), "power_bank");
    await userEvent.type(screen.getByLabelText("Words on the label"), "10000mAh 3.7V 37Wh");
    await userEvent.type(screen.getByLabelText("Watt-hours (Wh)"), "37");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onAdd.mock.calls[0]![0]).toMatchObject({ itemName: "Power bank", category: "power_bank", labelText: "10000mAh 3.7V 37Wh", wattHours: 37, evidence: "label_read" });
    await userEvent.type(screen.getByLabelText("Name (optional)"), "Grey scarf");
    await userEvent.selectOptions(screen.getByLabelText("What is it?"), "clothing");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onAdd.mock.calls[1]![0]).toMatchObject({ itemName: "Grey scarf", category: "clothing" });
  });

  it("will not add until the sender says what it is", () => {
    render(<AddByHand onAdd={() => {}} />);
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    expect(screen.getByTestId("add-by-hand")).toBeInTheDocument();
  });
});
