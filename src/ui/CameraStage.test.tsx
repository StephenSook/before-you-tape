import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ImagePart } from "../ai/port";
import { CameraError } from "../capture/camera";
import { CameraStage } from "./CameraStage";

const part: ImagePart = { mimeType: "image/jpeg", base64: "/9j/AAAA" };
const fakeStream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
const okCamera = vi.fn(async () => ({ stream: fakeStream, stop: vi.fn() }));
const photo = new File(["x"], "lotion.jpg", { type: "image/jpeg" });
const start = () => userEvent.click(screen.getByRole("button", { name: "Start camera" }));

describe("CameraStage", () => {
  // jsdom has no media playback; the stage only asks the video to play.
  beforeAll(() => { vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined); });

  it("keeps the camera off until the sender starts it, and turns it off on request", async () => {
    const stop = vi.fn();
    const open = vi.fn(async () => ({ stream: fakeStream, stop }));
    render(<CameraStage openCamera={open} onImage={() => {}} />);
    expect(screen.getByText("The camera stays off until you start it.")).toBeInTheDocument();
    expect(screen.getByTestId("upload-input")).toBeInTheDocument();
    expect(screen.queryByTestId("check-now")).toBeNull();
    await act(async () => { await Promise.resolve(); });
    expect(open).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Start camera" }));
    await waitFor(() => expect(open).toHaveBeenCalledWith("user"));
    expect(screen.getByTestId("check-now")).toBeInTheDocument();
    await act(async () => { await Promise.resolve(); });
    await userEvent.click(screen.getByRole("button", { name: "Turn off camera" }));
    expect(stop).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Start camera" })).toBeInTheDocument();
  });

  it("shows upload when camera is denied", async () => {
    render(<CameraStage openCamera={async () => { throw new CameraError("denied", "no"); }} onImage={() => {}} />);
    await start();
    expect(await screen.findByText("Camera is off. Add a photo instead.")).toBeInTheDocument();
    expect(screen.getByTestId("upload-input")).toBeInTheDocument();
  });

  it("says why for each other camera failure", async () => {
    const { unmount } = render(<CameraStage openCamera={async () => { throw new CameraError("none", "no"); }} onImage={() => {}} />);
    await start();
    expect(await screen.findByText("No camera found. Add a photo instead.")).toBeInTheDocument();
    unmount();
    render(<CameraStage openCamera={async () => { throw new CameraError("busy", "no"); }} onImage={() => {}} />);
    await start();
    expect(await screen.findByText("The camera is in use by another app. Add a photo instead.")).toBeInTheDocument();
  });

  it("offers the phone, a photo and typing when the camera cannot focus", () => {
    render(<CameraStage openCamera={okCamera} onImage={() => {}} forcedEvent={{ type: "cannot_focus" }} phoneReady />);
    expect(screen.getByText("This camera can't focus that close. Use your phone, add a photo, or type the numbers.")).toBeInTheDocument();
    for (const id of ["use-phone", "add-photo", "type-it"]) expect(screen.getByTestId(id)).toBeInTheDocument();
  });

  it("leaves out the phone until the phone handoff exists", () => {
    render(<CameraStage openCamera={okCamera} onImage={() => {}} forcedEvent={{ type: "cannot_focus" }} />);
    expect(screen.queryByTestId("use-phone")).toBeNull();
    expect(screen.getByTestId("type-it")).toBeInTheDocument();
  });

  it("asks the sender to hold still when the item is blurry", () => {
    render(<CameraStage openCamera={okCamera} onImage={() => {}} forcedEvent={{ type: "blurry" }} />);
    expect(screen.getByText("Hold it still")).toBeInTheDocument();
  });

  it("draws the hold zone, never mirrors the video, and gives one guidance line", async () => {
    render(<CameraStage openCamera={okCamera} onImage={() => {}} />);
    await start();
    await waitFor(() => expect(okCamera).toHaveBeenCalledWith("user"));
    expect(screen.getByTestId("hold-zone")).toBeInTheDocument();
    expect(screen.getByTestId("stage").querySelector("video")?.style.transform ?? "").not.toMatch(/scale/);
    expect(screen.getByText("Hold the label close to the camera, then press Check now.")).toBeInTheDocument();
  });

  it("reads the hold zone now on Check now and on Space", async () => {
    const onImage = vi.fn();
    const capture = vi.fn(async () => part);
    render(<CameraStage openCamera={okCamera} onImage={onImage} capture={capture} />);
    await start();
    await userEvent.click(screen.getByTestId("check-now"));
    await waitFor(() => expect(onImage).toHaveBeenCalledWith(part, "check_now"));
    await act(async () => { await userEvent.keyboard(" "); });
    await waitFor(() => expect(onImage).toHaveBeenCalledTimes(2));
  });

  it("opens a crop step for an added photo, turns the camera off, and sends only the part the sender checks", async () => {
    const onImage = vi.fn();
    const stop = vi.fn();
    const source = document.createElement("canvas");
    source.width = 400;
    source.height = 300;
    const decodeFile = vi.fn(async () => source);
    const cropPart = vi.fn(async () => part);
    render(<CameraStage openCamera={async () => ({ stream: fakeStream, stop })} onImage={onImage} decodeFile={decodeFile} cropPart={cropPart} />);
    await start();
    await act(async () => { await Promise.resolve(); });
    await userEvent.upload(screen.getByTestId("upload-input"), photo);
    expect(await screen.findByRole("img", { name: "The part that will be checked" })).toBeInTheDocument();
    expect(decodeFile).toHaveBeenCalledWith(photo);
    expect(stop).toHaveBeenCalled();
    expect(cropPart).toHaveBeenCalledWith(source, { x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
    expect(onImage).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Check this part" }));
    expect(onImage).toHaveBeenCalledWith(part, "upload");
    expect(screen.queryByTestId("photo-crop")).toBeNull();
  });

  it("sends nothing when the sender cancels the crop", async () => {
    const onImage = vi.fn();
    const source = document.createElement("canvas");
    render(<CameraStage openCamera={okCamera} onImage={onImage} decodeFile={async () => source} cropPart={async () => part} />);
    await userEvent.upload(screen.getByTestId("upload-input"), photo);
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(onImage).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Start camera" })).toBeInTheDocument();
  });

  it("stops the camera when the stage goes away", async () => {
    const stop = vi.fn();
    const { unmount } = render(<CameraStage openCamera={async () => ({ stream: fakeStream, stop })} onImage={() => {}} />);
    await start();
    await waitFor(() => expect(screen.getByTestId("hold-zone")).toBeInTheDocument());
    await act(async () => { await Promise.resolve(); });
    unmount();
    expect(stop).toHaveBeenCalled();
  });

  // A parent re-render (every box change) must not restart the frame watch: a fresh detector would see the
  // item still in the zone and read it a second time.
  it("keeps one frame watch and one camera across parent re-renders", async () => {
    const intervals = vi.spyOn(globalThis, "setInterval");
    const open = vi.fn(okCamera);
    const { rerender } = render(<CameraStage openCamera={open} onImage={() => {}} />);
    await start();
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    const before = intervals.mock.calls.length;
    rerender(<CameraStage openCamera={open} onImage={() => {}} onError={() => {}} />);
    rerender(<CameraStage openCamera={open} onImage={() => {}} onError={() => {}} />);
    expect(intervals.mock.calls.length).toBe(before);
    expect(open).toHaveBeenCalledTimes(1);
    intervals.mockRestore();
  });
});
