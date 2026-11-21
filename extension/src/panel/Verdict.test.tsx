import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ed } from "../../../tests/engine/helpers";
import { Details } from "./Details";

it("shows the engine's question and uses the answer", async () => {
  const user = userEvent.setup();
  render(<Details edition={ed} today={ed.suspensions.checkedOn} itemName="Laptop" onItemName={vi.fn()} />);
  await user.selectOptions(screen.getByLabelText("Item type"), "laptop");
  await user.click(screen.getByRole("button", { name: "Check" }));
  expect(screen.getByRole("heading", { name: "Check this" })).toBeVisible();
  await user.click(screen.getByLabelText("Used"));
  expect(screen.getByRole("heading", { name: "Take it out" })).toBeVisible();
  expect(screen.getByText("Priority Mail International")).toBeVisible();
  expect(screen.getByText(`Rules edition ${ed.editionId}`)).toBeVisible();
});
