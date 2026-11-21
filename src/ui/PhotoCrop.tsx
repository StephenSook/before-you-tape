// A photo the sender added is never read whole: they place a box over the item (the photo outside it is dimmed),
// and only "Check this part" sends the part inside it. Everything outside the box stays on this device. The
// button carries the SHA-256 of the exact part it will send, so a test can match it to the request.
// The box moves by dragging or with the arrow keys, and changes size from its corner or with Shift and
// the arrow keys.
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { ImagePart } from "../ai/port";
import type { Box } from "../capture/steady";

export type CropSource = HTMLCanvasElement | ImageBitmap;

export interface PhotoCropProps {
  source: CropSource;
  initialBox: Box;
  cropPart: (source: CropSource, box: Box) => Promise<ImagePart>;
  onSend: (part: ImagePart) => void;
  onCancel: () => void;
  // The error itself, for the caller to put in plain words.
  onError?: (e: unknown) => void;
}

const STEP = 0.02;
const MIN = 0.1;
const DISPLAY_MAX = 1024;
const round = (v: number) => Math.round(v * 100) / 100;
const textSha256 = async (text: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");

// Keeps the box at least MIN wide and tall, and inside the photo.
export function clampBox(b: Box): Box {
  const w = round(Math.min(1, Math.max(MIN, b.w)));
  const h = round(Math.min(1, Math.max(MIN, b.h)));
  return { x: round(Math.min(1 - w, Math.max(0, b.x))), y: round(Math.min(1 - h, Math.max(0, b.y))), w, h };
}

export function PhotoCrop({ source, initialBox, cropPart, onSend, onCancel, onError }: PhotoCropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<Box>(() => clampBox(initialBox));
  const [preview, setPreview] = useState<{ box: Box; part: ImagePart; sha256: string } | null>(null);
  const drag = useRef<{ mode: "move" | "size"; x: number; y: number; start: Box } | null>(null);

  // Draw the photo once, scaled down for the screen; the crop always comes from the full source.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const scale = Math.min(1, DISPLAY_MAX / Math.max(source.width, source.height));
    c.width = Math.max(1, Math.round(source.width * scale));
    c.height = Math.max(1, Math.round(source.height * scale));
    c.getContext("2d")?.drawImage(source, 0, 0, c.width, c.height);
  }, [source]);

  // The latest callbacks, so a parent re-render never restarts the preview.
  const latest = useRef({ cropPart, onError });
  useEffect(() => { latest.current = { cropPart, onError }; });

  // The preview is the exact part that would be sent for this box.
  useEffect(() => {
    let current = true;
    const t = setTimeout(() => {
      latest.current.cropPart(source, box).then(async (part) => {
        const sha256 = await textSha256(part.base64);
        if (current) setPreview({ box, part, sha256 });
      })
        .catch((e: unknown) => { if (current) latest.current.onError?.(e); });
    }, 120);
    return () => { current = false; clearTimeout(t); };
  }, [source, box]);

  const onKey = (e: KeyboardEvent) => {
    const d = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] }[e.key];
    if (!d) return;
    e.preventDefault();
    const [dx, dy] = d as [number, number];
    setBox((b) => clampBox(e.shiftKey ? { ...b, w: b.w + dx, h: b.h + dy } : { ...b, x: b.x + dx, y: b.y + dy }));
  };

  const beginDrag = (mode: "move" | "size", e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { mode, x: e.clientX, y: e.clientY, start: box };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!d || !rect || rect.width === 0 || rect.height === 0) return;
    const dx = (e.clientX - d.x) / rect.width;
    const dy = (e.clientY - d.y) / rect.height;
    setBox(clampBox(d.mode === "move" ? { ...d.start, x: d.start.x + dx, y: d.start.y + dy } : { ...d.start, w: d.start.w + dx, h: d.start.h + dy }));
  };
  const onUp = () => { drag.current = null; };

  const ready = preview !== null && preview.box === box;
  return (
    <div data-testid="photo-crop" className="photo-crop">
      <div ref={frameRef} className="crop-frame" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <canvas ref={canvasRef} role="img" aria-label="The photo you added" className="crop-photo" />
        <div role="group" tabIndex={0} aria-label="Crop box. Arrow keys move it; Shift and arrow keys change its size." data-testid="crop-box"
          className="crop-box" onKeyDown={onKey} onPointerDown={(e) => beginDrag("move", e)}
          style={{ position: "absolute", left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}>
          <div className="crop-handle" aria-hidden="true" onPointerDown={(e) => beginDrag("size", e)} />
        </div>
      </div>
      <p className="crop-actions">
        <button type="button" data-testid="send-crop" disabled={!ready} {...(ready ? { "data-part-sha256": preview.sha256 } : {})}
          onClick={() => { if (ready) onSend(preview.part); }}>Check this part</button>{" "}
        <button type="button" onClick={onCancel}>Cancel</button>
      </p>
    </div>
  );
}
