// The camera reads a steady item by itself only when its parent says it may (an on-device model exists).
// jsdom draws no video frames, so the frame grab and the detector are stood in for: every frame is steady.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImagePart } from "../ai/port";
import { CameraStage } from "./CameraStage";

vi.mock("../capture/steady", async (importOriginal) => {
  const real = await importOriginal<typeof import("../capture/steady")>();
  class AlwaysSteady { push() { return { type: "steady" as const, box: { x: 0.25, y: 0.15, w: 0.5, h: 0.7 } }; } }
  return { ...real, SteadyDetector: AlwaysSteady };
});

const part: ImagePart = { mimeType: "image/jpeg", base64: "/9j/AAAA" };
const camera = async () => ({ stream: { getTracks: () => [] } as unknown as MediaStream, stop: () => {} });

describe("CameraStage steady reads", () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(4);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      { drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray(64 * 36 * 4) }) } as unknown as CanvasRenderingContext2D);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("reads a steady item by itself when allowed", async () => {
    const onImage = vi.fn();
    render(<CameraStage openCamera={camera} onImage={onImage} capture={async () => part} autoRead />);
    await userEvent.click(screen.getByRole("button", { name: "Start camera" }));
    await waitFor(() => expect(onImage).toHaveBeenCalledWith(part, "steady"));
  });

  it("never reads by itself when not allowed, and says to press Check now", async () => {
    const onImage = vi.fn();
    render(<CameraStage openCamera={camera} onImage={onImage} capture={async () => part} />);
    await userEvent.click(screen.getByRole("button", { name: "Start camera" }));
    expect(await screen.findByText("Hold the label close to the camera, then press Check now.")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 450));
    expect(onImage).not.toHaveBeenCalled();
  });

  it("never reads before the camera is started", async () => {
    const onImage = vi.fn();
    render(<CameraStage openCamera={camera} onImage={onImage} capture={async () => part} autoRead />);
    await new Promise((r) => setTimeout(r, 450));
    expect(onImage).not.toHaveBeenCalled();
  });
});
