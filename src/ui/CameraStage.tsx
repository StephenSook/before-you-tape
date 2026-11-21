// The camera stage (plan Task 19). The camera stays off until the sender starts it, and can be turned off
// again. Once on, it shows the camera with the hold zone drawn on it, never mirrored, and reads the hold zone
// on "Check now" (or Space), or from a photo. It reads an item that sits still and sharp by itself only when
// the parent allows it (an on-device model exists; such a read never leaves this device). When the camera
// cannot help, it says why and offers the other ways in.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageHow, ImagePart } from "../ai/port";
import { CameraError, type CameraErrorKind, type openCamera as openCameraFn } from "../capture/camera";
import { CropError, cropToJpeg, decodePhoto } from "../capture/crop";
import { SteadyDetector, type Box, type SteadyConfig, type SteadyEvent } from "../capture/steady";
import { CROP_LIMITS } from "../shared/cropLimits";
import { PhotoCrop, type CropSource } from "./PhotoCrop";

export const HOLD_ZONE: Box = { x: 0.25, y: 0.15, w: 0.5, h: 0.7 };
// Where the box starts on an added photo: the middle, leaving out the edges, where an address would sit.
export const PHOTO_BOX: Box = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
const WHOLE_PHOTO: Box = { x: 0, y: 0, w: 1, h: 1 };
// Starting values; Task 17 Step 4 tunes them on the packing clip.
export const STEADY_CONFIG: SteadyConfig = { threshold: 24, steadyFrames: 8, minChangedFraction: 0.08, cooldownMs: 1500, minSharpness: 200, zone: HOLD_ZONE };
const FRAME_W = 64;
const FRAME_H = 36;
const FRAME_MS = 100;

export type { ImageHow };

export interface CameraStageProps {
  openCamera: typeof openCameraFn;
  onImage: (part: ImagePart, how: ImageHow) => void;
  // Shows the stage as if this event had just happened; for tests and the film.
  forcedEvent?: SteadyEvent;
  // The phone handoff exists, so "Use your phone" can be offered.
  phoneReady?: boolean;
  // On a phone: the rear camera, and the photo picker opens the camera.
  phone?: boolean;
  capture?: (box: Box) => Promise<ImagePart>;
  // An added photo is decoded, then cropped to the box the sender places; only that part is sent.
  decodeFile?: (file: File) => Promise<CropSource>;
  cropPart?: (source: CropSource, box: Box) => Promise<ImagePart>;
  onUsePhone?: () => void;
  onTypeIt?: () => void;
  onError?: (text: string) => void;
  // A press of Check now or of the sample, at the moment it happens, before any cropping.
  onPress?: () => void;
  // The camera may read an item that sits still by itself. Only true when that read stays on this device.
  autoRead?: boolean;
  // A tracked test photo a sender with no camera or no item can try. It goes through the same crop step and the
  // same upload path as a photo they add, so the same route and consent decide where it is read.
  sample?: { url: string; sha256: string; alt: string };
  loadSample?: (url: string) => Promise<ArrayBuffer>;
  // When the page has the sample's recorded read, a sample photo goes to it instead of a model.
  onSampleSend?: (part: ImagePart) => void;
}

const fetchSample = async (url: string): Promise<ArrayBuffer> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sample photo: HTTP ${res.status}`);
  return res.arrayBuffer();
};
const SAMPLE_FAILED = "The sample photo did not load as it should. Add a photo, or type the item.";
const bytesSha256 = async (bytes: ArrayBuffer): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");

const cropWithLimits = (source: CropSource, box: Box) => cropToJpeg(source, box, CROP_LIMITS.maxSide, CROP_LIMITS.jpegQuality);
const release = (s: CropSource) => (s as Partial<ImageBitmap>).close?.();

const CAMERA_TEXT: Record<CameraErrorKind, string> = {
  denied: "Camera is off. Add a photo instead.",
  none: "No camera found. Add a photo instead.",
  busy: "The camera is in use by another app. Add a photo instead.",
};

export function CameraStage({ openCamera, onImage, forcedEvent, phoneReady, phone, capture, decodeFile, cropPart, onUsePhone, onTypeIt, onError, onPress, autoRead = false, sample, loadSample = fetchSample, onSampleSend }: CameraStageProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const [started, setStarted] = useState(false);
  const [cameraError, setCameraError] = useState<CameraErrorKind | null>(null);
  // A photo the sender added, waiting for them to place the box and press Check this part.
  const [picked, setPicked] = useState<CropSource | null>(null);
  const [event, setEvent] = useState<SteadyEvent | null>(null);
  // The picked photo is the sample, and the last photo sent was the sample: both are said on the page.
  const [fromSample, setFromSample] = useState(false);
  const [sampleSent, setSampleSent] = useState(false);

  // The latest callbacks, kept in refs so a parent re-render never restarts the frame watch: a fresh
  // detector would see the item still in the zone and read it a second time.
  const latest = useRef({ onImage, onError, onPress, capture, autoRead, started });
  useEffect(() => { latest.current = { onImage, onError, onPress, capture, autoRead, started }; });

  // What the sender reads when a read or a photo fails: plain words, never the code's own message.
  const plain = (e: unknown, photo: boolean): string => {
    if (e instanceof CropError && /empty crop box/.test(e.message)) return "Hold the item inside the box, or type it instead.";
    return photo ? "That photo could not be opened. Try another, or type the item." : "That could not be read. Try again, or type the item.";
  };
  // Each photo pick, the sender's or the sample's, gets the next number, and so does each press of Check now (its
  // own count). A sample that finishes after a newer pick or press is dropped, so a slow sample never covers the
  // sender's own check; a press never drops the sender's own photo.
  const pickSeq = useRef(0);
  const pressSeq = useRef(0);
  const read = useCallback(async (box: Box, how: ImageHow) => {
    if (how === "check_now") { ++pressSeq.current; latest.current.onPress?.(); }
    const { onImage: emit, onError: fail, capture: grab } = latest.current;
    try {
      const video = videoRef.current;
      const part = grab ? await grab(box) : video ? await cropToJpeg(video, box, CROP_LIMITS.maxSide, CROP_LIMITS.jpegQuality) : null;
      if (!part) throw new Error("the camera is not ready");
      emit(part, how);
    } catch (e) {
      fail?.(plain(e, false));
    }
  }, []);

  // Open the camera only once the sender starts it, and stop it when turned off or the stage goes away.
  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    let cam: { stop(): void } | null = null;
    openCamera(phone ? "environment" : "user").then((c) => {
      if (cancelled) { c.stop(); return; }
      cam = c;
      const video = videoRef.current;
      if (video) {
        video.srcObject = c.stream;
        try { void video.play?.()?.catch?.(() => undefined); } catch { /* not every browser plays on request */ }
      }
    }).catch((e: unknown) => { if (!cancelled) setCameraError(e instanceof CameraError ? e.kind : "busy"); });
    return () => { cancelled = true; cam?.stop(); };
  }, [openCamera, phone, started]);

  // Watch small grey frames inside the hold zone for an item that sits still and sharp.
  useEffect(() => {
    if (!started || cameraError) return;
    const detector = new SteadyDetector(STEADY_CONFIG, FRAME_W, FRAME_H);
    const canvas = document.createElement("canvas");
    canvas.width = FRAME_W;
    canvas.height = FRAME_H;
    const timer = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, FRAME_W, FRAME_H);
      const rgba = ctx.getImageData(0, 0, FRAME_W, FRAME_H).data;
      const gray = new Uint8ClampedArray(FRAME_W * FRAME_H);
      for (let i = 0; i < gray.length; i++) gray[i] = ((rgba[i * 4] as number) * 77 + (rgba[i * 4 + 1] as number) * 150 + (rgba[i * 4 + 2] as number) * 29) >> 8;
      const ev = detector.push(gray, performance.now());
      if (!ev) return;
      if (ev.type === "steady" && latest.current.autoRead) void read(ev.box, "steady");
      if (ev.type !== "progress") setEvent(ev.type === "cleared" || ev.type === "steady" ? null : ev);
    }, FRAME_MS);
    return () => clearInterval(timer);
  }, [started, cameraError, read]);

  // Space reads the hold zone now, unless the sender is pressing a control that Space already works.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      if (!latest.current.started) return;
      const t = e.target as HTMLElement | null;
      if (t && t.closest("button, input, select, textarea, a, summary")) return;
      e.preventDefault();
      void read(HOLD_ZONE, "check_now");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [read]);

  // An added photo turns the camera off and opens the crop step; nothing is read yet.
  const onFile = async (file: File | undefined, isSample = false, seq?: number) => {
    if (!file) return;
    const mine = seq ?? ++pickSeq.current;
    setSampleSent(false);
    try {
      const source = await (decodeFile ?? decodePhoto)(file);
      if (mine !== pickSeq.current) { release(source); return; }
      setFromSample(isSample);
      setStarted(false);
      setEvent(null);
      setPicked((old) => { if (old) release(old); return source; });
    } catch (e) {
      onError?.(plain(e, true));
    }
  };
  const closePicked = () => setPicked((old) => { if (old) release(old); return null; });
  // The sample is used only when its bytes are the tracked photo's. With a recorded read, the whole photo goes to
  // it (that read is of the whole photo); with none, it is an added photo like any other.
  const trySample = async () => {
    if (!sample) return;
    latest.current.onPress?.();
    const mine = ++pickSeq.current;
    const press = pressSeq.current;
    const current = () => mine === pickSeq.current && press === pressSeq.current;
    try {
      const bytes = await loadSample(sample.url);
      if (!current()) return;
      if ((await bytesSha256(bytes)) !== sample.sha256) { onError?.(SAMPLE_FAILED); return; }
      const file = new File([bytes], sample.url.split("/").pop() ?? "sample.jpg", { type: "image/jpeg" });
      if (!onSampleSend) { await onFile(file, true, mine); return; }
      const source = await (decodeFile ?? decodePhoto)(file);
      if (!current()) { release(source); return; }
      let part: ImagePart;
      try {
        part = await (cropPart ?? cropWithLimits)(source, WHOLE_PHOTO);
      } finally {
        release(source);
      }
      if (!current()) return;
      setSampleSent(true);
      onSampleSend(part);
    } catch {
      // A sample a newer photo or press replaced says nothing over it.
      if (current()) onError?.(SAMPLE_FAILED);
    }
  };

  if (picked) {
    return (
      <section data-testid="stage" className="stage" aria-label="Camera">
        {fromSample && sample && <p data-testid="sample-note" className="stage-line">Sample photo from our test set: {sample.alt}. It is not your item.</p>}
        <PhotoCrop source={picked} initialBox={PHOTO_BOX} cropPart={cropPart ?? cropWithLimits} onError={(e) => onError?.(plain(e, true))}
          onSend={(part) => { closePicked(); setSampleSent(fromSample); onImage(part, "upload"); }} onCancel={closePicked} />
      </section>
    );
  }

  const shown = forcedEvent ?? event;
  return (
    <section data-testid="stage" className="stage" aria-label="Camera">
      {!started && <p className="stage-line">The camera stays off until you start it.</p>}
      {started && (cameraError ? <p className="stage-line">{CAMERA_TEXT[cameraError]}</p> : (
        <div style={{ position: "relative" }}>
          <video ref={videoRef} muted playsInline aria-label="Camera view" />
          <div data-testid="hold-zone" className="hold-zone" aria-hidden="true"
            style={{ left: `${HOLD_ZONE.x * 100}%`, top: `${HOLD_ZONE.y * 100}%`, width: `${HOLD_ZONE.w * 100}%`, height: `${HOLD_ZONE.h * 100}%` }} />
        </div>
      ))}
      {started && !cameraError && !shown && (
        <p className="stage-line">{autoRead ? "Hold the label close to the camera." : "Hold the label close to the camera, then press Check now."}</p>
      )}
      {shown?.type === "blurry" && <p className="stage-line" role="status">Hold it still</p>}
      {shown?.type === "cannot_focus" && (
        <div role="status">
          <p className="stage-line">{phoneReady
            ? "This camera can't focus that close. Use your phone, add a photo, or type the numbers."
            : "This camera can't focus that close. Add a photo, or type the numbers."}</p>
          {phoneReady && <button type="button" data-testid="use-phone" onClick={onUsePhone}>Use your phone</button>}
          <button type="button" data-testid="add-photo" onClick={() => uploadRef.current?.click()}>Add a photo</button>
          <button type="button" data-testid="type-it" onClick={onTypeIt}>Type it</button>
        </div>
      )}
      <p>
        {!started && <button type="button" data-testid="start-camera" onClick={() => { setCameraError(null); setStarted(true); }}>Start camera</button>}
        {started && !cameraError && <button type="button" data-testid="check-now" onClick={() => void read(HOLD_ZONE, "check_now")}>Check now</button>}{" "}
        {started && !cameraError && <button type="button" data-testid="stop-camera" onClick={() => { setStarted(false); setEvent(null); }}>Turn off camera</button>}{" "}
        {/* A button-styled label; the native picker stays in the page, hidden, so keyboards still reach it. */}
        <label className="button-like">
          Add a photo
          <input ref={uploadRef} data-testid="upload-input" className="visually-hidden" type="file" accept="image/*" {...(phone ? { capture: "environment" } : {})}
            onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {sample && <>{" "}<button type="button" data-testid="sample-photo" onClick={() => void trySample()}>Try a sample photo</button></>}
      </p>
      {sampleSent && <p data-testid="sample-sent" className="stage-line">{onSampleSend
        ? "The last check showed a recorded read of a sample photo from our test set, not your item."
        : "The last check used a sample photo from our test set, not your item."}</p>}
    </section>
  );
}
