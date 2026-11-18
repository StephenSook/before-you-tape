import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BlindPage, type BlindItem, type BlindPageProps } from "./BlindPage";

const items: BlindItem[] = [
  { itemId: "a", photo: "/eval/items/a.jpg", alt: "A bottle of perfume", credit: "Photo: Jane Roe, CC BY 4.0, Wikimedia Commons" },
  { itemId: "b", photo: "/eval/items/b.jpg", alt: "A power bank", credit: "Photo by the project owner" },
];
const destinations = [{ code: "CA", name: "Canada" }, { code: "PH", name: "Philippines" }];
const setup = (o: { locked?: boolean; save?: BlindPageProps["save"] } = {}) => {
  const save = vi.fn<BlindPageProps["save"]>(o.save ?? (async () => {}));
  const submit = vi.fn<BlindPageProps["submit"]>(async () => {});
  render(<BlindPage items={items} destinations={destinations} save={save} submit={submit} locked={o.locked ?? false} />);
  return { save, submit };
};

describe("BlindPage", () => {
  it("shows three choices for every item and destination, and nothing from the app", () => {
    setup();
    const groups = screen.getAllByRole("group");
    expect(groups).toHaveLength(4);
    for (const g of groups) for (const n of ["Ship", "Don't ship", "Depends"]) expect(within(g).getByRole("button", { name: n })).toBeInTheDocument();
    expect(screen.queryByText(/OK to pack|Take it out|Check this|Read on|Read in the cloud/)).toBeNull();
    expect(screen.getByRole("img", { name: "A bottle of perfume" })).toHaveAttribute("src", "/eval/items/a.jpg");
  });

  it("saves each choice with its item and destination, and marks it", async () => {
    const { save } = setup();
    const canada = screen.getByRole("group", { name: "A bottle of perfume, to Canada" });
    await userEvent.click(within(canada).getByRole("button", { name: "Don't ship" }));
    expect(save).toHaveBeenCalledWith({ itemId: "a", destination: "CA", call: "dont_ship" });
    expect(within(canada).getByRole("button", { name: "Don't ship" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1 of 4 answered")).toBeInTheDocument();
  });

  it("says when a choice was not saved, and leaves it unmarked", async () => {
    setup({ save: async () => { throw new Error("offline"); } });
    const g = screen.getByRole("group", { name: "A power bank, to Philippines" });
    await userEvent.click(within(g).getByRole("button", { name: "Ship" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Not saved. Check the connection and try again.");
    expect(within(g).getByRole("button", { name: "Ship" })).toHaveAttribute("aria-pressed", "false");
  });

  it("sends only when every pair is answered, then locks and thanks the reviewer", async () => {
    const { submit } = setup();
    const send = screen.getByRole("button", { name: "Send my answers" });
    expect(send).toBeDisabled();
    for (const g of screen.getAllByRole("group")) await userEvent.click(within(g).getByRole("button", { name: "Depends" }));
    expect(send).toBeEnabled();
    await userEvent.click(send);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Thank you. Your answers are in.")).toBeInTheDocument();
    for (const b of screen.getAllByRole("button", { name: "Ship" })) expect(b).toBeDisabled();
  });

  it("shows a locked session as finished, with no choice left to change", () => {
    setup({ locked: true });
    expect(screen.getByText("Thank you. Your answers are in.")).toBeInTheDocument();
    for (const b of screen.getAllByRole("button", { name: /Ship|Depends/ })) expect(b).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Send my answers" })).toBeNull();
  });

  it("credits every photo", () => {
    setup();
    const credits = screen.getByRole("contentinfo");
    expect(credits).toHaveTextContent("Photo: Jane Roe, CC BY 4.0, Wikimedia Commons");
    expect(credits).toHaveTextContent("Photo by the project owner");
  });
});
