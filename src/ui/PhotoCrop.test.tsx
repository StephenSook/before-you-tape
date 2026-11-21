import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ImagePart } from "../ai/port";
import type { Box } from "../capture/steady";
import { PhotoCrop } from "./PhotoCrop";

const photo = () => { const c = document.createElement("canvas"); c.width = 400; c.height = 300; return c; };
// A stand-in crop that records the box it was given, so a test can tell which box a part came from.
const cropPart = vi.fn(async (_s: unknown, box: Box): Promise<ImagePart> => ({ mimeType: "image/jpeg", base64: btoa(JSON.stringify(box)) }));
const boxOf = (p: ImagePart) => JSON.parse(atob(p.base64)) as Box;
const start: Box = { x: 0.25, y: 0.15, w: 0.5, h: 0.7 };
// The SHA-256 of a part's base64 text, as the send button carries it.
const shaOf = async (box: Box) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(btoa(JSON.stringify(box)))))]
  .map((b) => b.toString(16).padStart(2, "0")).join("");
const send = () => screen.getByRole("button", { name: "Check this part" });

describe("PhotoCrop", () => {
  it("shows the photo and the box, names the exact part the press will send, and sends it only on the press", async () => {
    const onSend = vi.fn();
    render(<PhotoCrop source={photo()} initialBox={start} cropPart={cropPart} onSend={onSend} onCancel={() => {}} />);
    expect(screen.getByRole("img", { name: "The photo you added" })).toBeInTheDocument();
    // The dimmed photo around the box shows what stays on the device; no second copy of the part is drawn.
    expect(screen.queryByRole("img", { name: "The part that will be checked" })).toBeNull();
    expect(screen.queryByText(/Only the part inside it is checked/)).toBeNull();
    await waitFor(() => expect(send()).toBeEnabled());
    expect(send()).toHaveAttribute("data-part-sha256", await shaOf(start));
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Check this part" }));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(boxOf(onSend.mock.calls[0]![0] as ImagePart)).toEqual(start);
  });

  it("moves the box with the arrow keys and resizes it with Shift, and the part the press sends follows", async () => {
    const onSend = vi.fn();
    render(<PhotoCrop source={photo()} initialBox={start} cropPart={cropPart} onSend={onSend} onCancel={() => {}} />);
    const box = screen.getByRole("group", { name: /Crop box/ });
    box.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{Shift>}{ArrowUp}{/Shift}");
    const moved = { x: 0.29, y: 0.15, w: 0.5, h: 0.68 };
    const movedSha = await shaOf(moved);
    await waitFor(() => expect(send()).toHaveAttribute("data-part-sha256", movedSha));
    await userEvent.click(screen.getByRole("button", { name: "Check this part" }));
    expect(boxOf(onSend.mock.calls[0]![0] as ImagePart)).toEqual(moved);
  });

  it("keeps the box inside the photo", async () => {
    const onSend = vi.fn();
    render(<PhotoCrop source={photo()} initialBox={{ x: 0.9, y: 0, w: 0.1, h: 0.1 }} cropPart={cropPart} onSend={onSend} onCancel={() => {}} />);
    screen.getByRole("group", { name: /Crop box/ }).focus();
    await userEvent.keyboard("{ArrowRight}{ArrowUp}{Shift>}{ArrowDown}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{/Shift}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Check this part" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Check this part" }));
    const b = boxOf(onSend.mock.calls[0]![0] as ImagePart);
    expect(b.x + b.w).toBeLessThanOrEqual(1);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.w).toBeGreaterThanOrEqual(0.1);
  });

  it("sends nothing on Cancel", async () => {
    const onSend = vi.fn();
    const onCancel = vi.fn();
    render(<PhotoCrop source={photo()} initialBox={start} cropPart={cropPart} onSend={onSend} onCancel={onCancel} />);
    await waitFor(() => expect(send()).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
  });
});
