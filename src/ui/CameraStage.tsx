// The camera stage (plan Task 19). The camera stays off until the sender starts it, and can be turned off
// again. Once on, it shows the camera with the hold zone drawn on it, never mirrored, and reads the hold zone
// on "Check now" (or Space), or from a photo. It reads an item that sits still and sharp by itself only when
// the parent allows it (an on-device model exists; such a read never leaves this device). When the camera
// cannot help, it says why and offers the other ways in.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageHow, ImagePart } from "../ai/port";
import { CameraError, type CameraErrorKind, type openCamera as openCameraFn } from "../capture/camera";
import { cropToJpeg, fileToJpeg } from "../capture/crop";
import { SteadyDetector, type Box, type SteadyConfig, type SteadyEvent } from "../capture/steady";
import { CROP_LIMITS } from "../shared/cropLimits";

export const HOLD_ZONE: Box = { x: 0.25, y: 0.15, w: 0.5, h: 0.7 };
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
  readFile?: (file: File) => Promise<ImagePart>;
  onUsePhone?: () => void;
  onTypeIt?: () => void;
  onError?: (text: string) => void;
  // The camera may read an item that sits still by itself. Only true when that read stays on this device.
  autoRead?: boolean;
}

const CAMERA_TEXT: Record<CameraErrorKind, string> = {
  denied: "Camera is off. Add a photo instead.",
  none: "No camera found. Add a photo instead.",
  busy: "The camera is in use by another app. Add a photo instead.",
};

export function CameraStage({ openCamera, onImage, forcedEvent, phoneReady, phone, capture, readFile, onUsePhone, onTypeIt, onError, autoRead = false }: CameraStageProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const [started, setStarted] = useState(false);
  const [cameraError, setCameraError] = useState<CameraErrorKind | null>(null);
  const [event, setEvent] = useState<SteadyEvent | null>(null);

  // The latest callbacks, kept in refs so a parent re-render never restarts the frame watch: a fresh
  // detector would see the item still in the zone and read it a second time.
  const latest = useRef({ onImage, onError, capture, autoRead, started });
  useEffect(() => { latest.current = { onImage, onError, capture, autoRead, started }; });

  const read = useCallback(async (box: Box, how: ImageHow) => {
    const { onImage: emit, onError: fail, capture: grab } = latest.current;
    try {
      const video = videoRef.current;
      const part = grab ? await grab(box) : video ? await cropToJpeg(video, box, CROP_LIMITS.maxSide, CROP_LIMITS.jpegQuality) : null;
      if (!part) throw new Error("the camera is not ready");
      emit(part, how);
    } catch (e) {
      fail?.(e instanceof Error ? e.message : String(e));
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

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      onImage(await (readFile ?? ((f: File) => fileToJpeg(f, CROP_LIMITS.maxSide, CROP_LIMITS.jpegQuality)))(file), "upload");
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    }
  };

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
          <p className="stage-line">This camera can't focus that close. Use your phone, add a photo, or type the numbers.</p>
          {phoneReady && <button type="button" data-testid="use-phone" onClick={onUsePhone}>Use your phone</button>}
          <button type="button" data-testid="add-photo" onClick={() => uploadRef.current?.click()}>Add a photo</button>
          <button type="button" data-testid="type-it" onClick={onTypeIt}>Type it</button>
        </div>
      )}
      <p>
        {!started && <button type="button" data-testid="start-camera" onClick={() => { setCameraError(null); setStarted(true); }}>Start camera</button>}
        {started && !cameraError && <button type="button" data-testid="check-now" onClick={() => void read(HOLD_ZONE, "check_now")}>Check now</button>}{" "}
        {started && !cameraError && <button type="button" data-testid="stop-camera" onClick={() => { setStarted(false); setEvent(null); }}>Turn off camera</button>}{" "}
        <label>
          Add a photo{" "}
          <input ref={uploadRef} data-testid="upload-input" type="file" accept="image/*" {...(phone ? { capture: "environment" } : {})}
            onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </p>
    </section>
  );
}
