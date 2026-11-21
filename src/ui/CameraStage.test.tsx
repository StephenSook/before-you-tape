import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ImagePart } from "../ai/port";
import { CameraError } from "../capture/camera";
import { CropError } from "../capture/crop";
import { CameraStage } from "./CameraStage";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../../eval/set/manifest.json";

const sampleItem = manifest.items.find((i) => i.itemId === "own-18")!;

const part: ImagePart = { mimeType: "image/jpeg", base64: "/9j/AAAA" };
const fakeStream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
const okCamera = vi.fn(async () => ({ stream: fakeStream, stop: vi.fn() }));
const photo = new File(["x"], "lotion.jpg", { type: "image/jpeg" });
const start = () => userEvent.click(screen.getByRole("button", { name: "Start camera" }));

describe("CameraStage", () => {
  it("offers Add a photo as a button, with the file picker itself hidden but still reachable", () => {
    render(<CameraStage openCamera={async () => ({ stream: { getTracks: () => [] } as unknown as MediaStream, stop: () => {} })} onImage={() => {}} />);
    const input = screen.getByLabelText("Add a photo");
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveClass("visually-hidden");
    expect(input.closest("label")).toHaveClass("button-like");
  });

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

  it("leaves out the phone until the phone handoff exists, in the words too", () => {
    render(<CameraStage openCamera={okCamera} onImage={() => {}} forcedEvent={{ type: "cannot_focus" }} />);
    expect(screen.queryByTestId("use-phone")).toBeNull();
    expect(screen.getByText("This camera can't focus that close. Add a photo, or type the numbers.")).toBeInTheDocument();
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

  it("says in plain words why Check now read nothing, never the raw error", async () => {
    const onError = vi.fn();
    const capture = vi.fn(async () => { throw new CropError("empty crop box"); });
    render(<CameraStage openCamera={okCamera} onImage={() => {}} onError={onError} capture={capture} />);
    await start();
    await userEvent.click(screen.getByTestId("check-now"));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Hold the item inside the box, or type it instead."));
    capture.mockImplementationOnce(async () => { throw new Error("some internal detail"); });
    await userEvent.click(screen.getByTestId("check-now"));
    await waitFor(() => expect(onError).toHaveBeenLastCalledWith("That could not be read. Try again, or type the item."));
    expect(onError.mock.calls.flat().join(" ")).not.toMatch(/crop box|internal detail/);
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

  it("runs a sample photo through the same crop step and the same upload path, labelled as a sample", async () => {
    const onImage = vi.fn();
    const bytes = readFileSync(join(process.cwd(), "public", sampleItem.photo));
    const decodeFile = vi.fn<(f: File) => Promise<HTMLCanvasElement>>(async () => document.createElement("canvas"));
    const loadSample = vi.fn(async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    render(<CameraStage openCamera={okCamera} onImage={onImage} decodeFile={decodeFile} cropPart={async () => part}
      sample={{ url: sampleItem.photo, sha256: sampleItem.photoSha256, alt: sampleItem.alt }} loadSample={loadSample} />);
    await userEvent.click(screen.getByRole("button", { name: "Try a sample photo" }));
    expect(await screen.findByTestId("sample-note")).toHaveTextContent(`Sample photo from our test set: ${sampleItem.alt}. It is not your item.`);
    expect(loadSample).toHaveBeenCalledWith(sampleItem.photo);
    // The same decode as a photo the sender adds: the file holds the tracked bytes.
    const file = decodeFile.mock.calls[0]![0];
    expect(Buffer.from(await file.arrayBuffer()).equals(bytes)).toBe(true);
    // The preview can take over a second when the whole suite runs at once.
    await screen.findByRole("img", { name: "The part that will be checked" }, { timeout: 5000 });
    await userEvent.click(screen.getByRole("button", { name: "Check this part" }));
    expect(onImage).toHaveBeenCalledWith(part, "upload");
    expect(screen.getByTestId("sample-sent")).toHaveTextContent("The last check used a sample photo from our test set, not your item.");
  });

  it("hands the whole sample photo to its recorded read, with no crop step, and reads no model", async () => {
    const onImage = vi.fn();
    const onSampleSend = vi.fn();
    const bytes = readFileSync(join(process.cwd(), "public", sampleItem.photo));
    const decodeFile = vi.fn<(f: File) => Promise<HTMLCanvasElement>>(async () => document.createElement("canvas"));
    const cropPart = vi.fn(async () => part);
    render(<CameraStage openCamera={okCamera} onImage={onImage} onSampleSend={onSampleSend} decodeFile={decodeFile} cropPart={cropPart}
      sample={{ url: sampleItem.photo, sha256: sampleItem.photoSha256, alt: sampleItem.alt }}
      loadSample={async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)} />);
    await userEvent.click(screen.getByRole("button", { name: "Try a sample photo" }));
    await waitFor(() => expect(onSampleSend).toHaveBeenCalledWith(part));
    // The recorded read is of the whole photo, so the whole photo is what the card keeps.
    expect(cropPart).toHaveBeenCalledWith(expect.anything(), { x: 0, y: 0, w: 1, h: 1 });
    expect(screen.queryByRole("button", { name: "Check this part" })).toBeNull();
    expect(onImage).not.toHaveBeenCalled();
    expect(screen.getByTestId("sample-sent")).toHaveTextContent("The last check showed a recorded read of a sample photo from our test set, not your item.");
  });

  it("drops a sample that arrives after the sender added their own photo, so their photo never gets the sample's read", async () => {
    const onImage = vi.fn();
    const onSampleSend = vi.fn();
    const bytes = readFileSync(join(process.cwd(), "public", sampleItem.photo));
    let arrive: (b: ArrayBuffer) => void = () => {};
    const loadSample = () => new Promise<ArrayBuffer>((r) => { arrive = r; });
    render(<CameraStage openCamera={okCamera} onImage={onImage} onSampleSend={onSampleSend} decodeFile={async () => document.createElement("canvas")}
      cropPart={async () => part} sample={{ url: sampleItem.photo, sha256: sampleItem.photoSha256, alt: sampleItem.alt }} loadSample={loadSample} />);
    await userEvent.click(screen.getByRole("button", { name: "Try a sample photo" }));
    await userEvent.upload(screen.getByTestId("upload-input"), new File(["x"], "bank.jpg", { type: "image/jpeg" }));
    const send = await screen.findByRole("button", { name: "Check this part" });
    arrive(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    await waitFor(() => expect(send).toBeEnabled());
    await userEvent.click(send);
    expect(onImage).toHaveBeenCalledWith(part, "upload");
    expect(onSampleSend).not.toHaveBeenCalled();
  });

  it("drops a pending sample once the sender presses Check now", async () => {
    const onImage = vi.fn();
    const onSampleSend = vi.fn();
    const bytes = readFileSync(join(process.cwd(), "public", sampleItem.photo));
    let arrive: (b: ArrayBuffer) => void = () => {};
    render(<CameraStage openCamera={okCamera} onImage={onImage} onSampleSend={onSampleSend} capture={async () => part} decodeFile={async () => document.createElement("canvas")}
      cropPart={async () => part} sample={{ url: sampleItem.photo, sha256: sampleItem.photoSha256, alt: sampleItem.alt }}
      loadSample={() => new Promise<ArrayBuffer>((r) => { arrive = r; })} />);
    await userEvent.click(screen.getByRole("button", { name: "Try a sample photo" }));
    await userEvent.click(screen.getByRole("button", { name: "Start camera" }));
    await userEvent.click(await screen.findByRole("button", { name: "Check now" }));
    expect(onImage).toHaveBeenCalledWith(part, "check_now");
    arrive(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(onSampleSend).not.toHaveBeenCalled();
  });

  it("still opens the sender's own photo when a Check now pressed while it decodes fails", async () => {
    let decoded: (c: HTMLCanvasElement) => void = () => {};
    render(<CameraStage openCamera={okCamera} onImage={() => {}} onError={() => {}} capture={async () => { throw new Error("no frame yet"); }}
      decodeFile={() => new Promise<HTMLCanvasElement>((r) => { decoded = r; })} cropPart={async () => part} />);
    await userEvent.click(screen.getByRole("button", { name: "Start camera" }));
    await userEvent.upload(screen.getByTestId("upload-input"), new File(["x"], "bank.jpg", { type: "image/jpeg" }));
    await userEvent.click(await screen.findByRole("button", { name: "Check now" }));
    await act(async () => { decoded(document.createElement("canvas")); await new Promise((r) => setTimeout(r, 20)); });
    expect(await screen.findByRole("button", { name: "Check this part" })).toBeInTheDocument();
  });

  it("says nothing when a sample that a newer photo replaced fails to load", async () => {
    const onError = vi.fn();
    let fail: () => void = () => {};
    render(<CameraStage openCamera={okCamera} onImage={() => {}} onError={onError} onSampleSend={() => {}} decodeFile={async () => document.createElement("canvas")}
      cropPart={async () => part} sample={{ url: sampleItem.photo, sha256: sampleItem.photoSha256, alt: sampleItem.alt }}
      loadSample={() => new Promise<ArrayBuffer>((_, no) => { fail = () => no(new Error("offline")); })} />);
    await userEvent.click(screen.getByRole("button", { name: "Try a sample photo" }));
    await userEvent.upload(screen.getByTestId("upload-input"), new File(["x"], "bank.jpg", { type: "image/jpeg" }));
    await screen.findByRole("button", { name: "Check this part" });
    await act(async () => { fail(); await new Promise((r) => setTimeout(r, 20)); });
    expect(onError).not.toHaveBeenCalled();
  });

  it("closes the decoded sample even when it cannot be encoded", async () => {
    const close = vi.fn();
    const bytes = readFileSync(join(process.cwd(), "public", sampleItem.photo));
    render(<CameraStage openCamera={okCamera} onImage={() => {}} onError={() => {}} onSampleSend={() => {}}
      decodeFile={async () => Object.assign(document.createElement("canvas"), { close })} cropPart={async () => { throw new Error("no blob"); }}
      sample={{ url: sampleItem.photo, sha256: sampleItem.photoSha256, alt: sampleItem.alt }}
      loadSample={async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)} />);
    await userEvent.click(screen.getByRole("button", { name: "Try a sample photo" }));
    await waitFor(() => expect(close).toHaveBeenCalled());
  });

  it("opens nothing when the sample photo does not match its tracked SHA-256", async () => {
    const onError = vi.fn();
    const decodeFile = vi.fn(async () => document.createElement("canvas"));
    render(<CameraStage openCamera={okCamera} onImage={() => {}} onError={onError} decodeFile={decodeFile}
      sample={{ url: sampleItem.photo, sha256: sampleItem.photoSha256, alt: sampleItem.alt }} loadSample={async () => new TextEncoder().encode("not the photo").buffer} />);
    await userEvent.click(screen.getByRole("button", { name: "Try a sample photo" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("The sample photo did not load as it should. Add a photo, or type the item."));
    expect(decodeFile).not.toHaveBeenCalled();
    expect(screen.queryByTestId("sample-note")).toBeNull();
  });

  it("keeps the tracked sample photo byte for byte as the eval set records it", () => {
    const bytes = readFileSync(join(process.cwd(), "public", sampleItem.photo));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(sampleItem.photoSha256);
  });

  it("says a crop preview that fails in plain words, never the browser's error", async () => {
    const onError = vi.fn();
    const source = document.createElement("canvas");
    render(<CameraStage openCamera={okCamera} onImage={() => {}} onError={onError} decodeFile={async () => source}
      cropPart={async () => { throw new Error("the browser could not encode the crop"); }} />);
    await userEvent.upload(screen.getByTestId("upload-input"), photo);
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError).toHaveBeenLastCalledWith("That photo could not be opened. Try another, or type the item.");
    expect(onError).not.toHaveBeenCalledWith(expect.stringMatching(/encode/));
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
