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

describe("CameraStage", () => {
  // jsdom has no media playback; the stage only asks the video to play.
  beforeAll(() => { vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined); });

  it("shows upload when camera is denied", async () => {
    render(<CameraStage openCamera={async () => { throw new CameraError("denied", "no"); }} onImage={() => {}} />);
    expect(await screen.findByText("Camera is off. Add a photo instead.")).toBeInTheDocument();
    expect(screen.getByTestId("upload-input")).toBeInTheDocument();
  });

  it("says why for each other camera failure", async () => {
    const { unmount } = render(<CameraStage openCamera={async () => { throw new CameraError("none", "no"); }} onImage={() => {}} />);
    expect(await screen.findByText("No camera found. Add a photo instead.")).toBeInTheDocument();
    unmount();
    render(<CameraStage openCamera={async () => { throw new CameraError("busy", "no"); }} onImage={() => {}} />);
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
    await waitFor(() => expect(okCamera).toHaveBeenCalledWith("user"));
    expect(screen.getByTestId("hold-zone")).toBeInTheDocument();
    expect(screen.getByTestId("stage").querySelector("video")?.style.transform ?? "").not.toMatch(/scale/);
    expect(screen.getByText("Hold the label close to the camera.")).toBeInTheDocument();
  });

  it("reads the hold zone now on Check now and on Space", async () => {
    const onImage = vi.fn();
    const capture = vi.fn(async () => part);
    render(<CameraStage openCamera={okCamera} onImage={onImage} capture={capture} />);
    await userEvent.click(screen.getByTestId("check-now"));
    await waitFor(() => expect(onImage).toHaveBeenCalledWith(part, "check_now"));
    await act(async () => { await userEvent.keyboard(" "); });
    await waitFor(() => expect(onImage).toHaveBeenCalledTimes(2));
  });

  it("turns an added photo into a JPEG for the read", async () => {
    const onImage = vi.fn();
    const readFile = vi.fn(async () => part);
    render(<CameraStage openCamera={okCamera} onImage={onImage} readFile={readFile} />);
    await userEvent.upload(screen.getByTestId("upload-input"), photo);
    await waitFor(() => expect(onImage).toHaveBeenCalledWith(part, "upload"));
    expect(readFile).toHaveBeenCalledWith(photo);
  });

  it("stops the camera when the stage goes away", async () => {
    const stop = vi.fn();
    const { unmount } = render(<CameraStage openCamera={async () => ({ stream: fakeStream, stop })} onImage={() => {}} />);
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
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    const before = intervals.mock.calls.length;
    rerender(<CameraStage openCamera={open} onImage={() => {}} onError={() => {}} />);
    rerender(<CameraStage openCamera={open} onImage={() => {}} onError={() => {}} />);
    expect(intervals.mock.calls.length).toBe(before);
    expect(open).toHaveBeenCalledTimes(1);
    intervals.mockRestore();
  });
});
