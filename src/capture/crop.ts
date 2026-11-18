// Crops the hold-zone box out of a frame and encodes it as a JPEG part for a model call. Only this
// crop ever leaves the device, never the whole frame, and never one over the shared byte cap.
import type { ImagePart } from "../ai/port";
import { CROP_LIMITS } from "../shared/cropLimits";
import type { Box } from "./steady";

export class CropError extends Error {
  override name = "CropError";
}

export interface CropPlan { sx: number; sy: number; sw: number; sh: number; dw: number; dh: number }

const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));

export function cropPlan(srcW: number, srcH: number, box: Box, maxSide: number): CropPlan {
  const sx = clamp(Math.round(box.x * srcW), srcW);
  const sy = clamp(Math.round(box.y * srcH), srcH);
  const sw = clamp(Math.round((box.x + box.w) * srcW), srcW) - sx;
  const sh = clamp(Math.round((box.y + box.h) * srcH), srcH) - sy;
  if (sw <= 0 || sh <= 0) throw new CropError("empty crop box");
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  return { sx, sy, sw, sh, dw: Math.max(1, Math.round(sw * scale)), dh: Math.max(1, Math.round(sh * scale)) };
}

type Source = HTMLVideoElement | HTMLCanvasElement | ImageBitmap | HTMLImageElement;

function sourceSize(s: Source): { w: number; h: number } {
  if (typeof HTMLVideoElement !== "undefined" && s instanceof HTMLVideoElement) return { w: s.videoWidth, h: s.videoHeight };
  if (typeof HTMLImageElement !== "undefined" && s instanceof HTMLImageElement) return { w: s.naturalWidth, h: s.naturalHeight };
  return { w: s.width, h: s.height };
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((done, fail) => canvas.toBlob((b) => (b ? done(b) : fail(new CropError("the browser could not encode the crop"))), "image/jpeg", quality));
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function cropToJpeg(source: Source, box: Box, maxSide: number, quality: number, maxBytes: number = CROP_LIMITS.maxBytes): Promise<ImagePart> {
  const { w, h } = sourceSize(source);
  const p = cropPlan(w, h, box, maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = p.dw;
  canvas.height = p.dh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new CropError("no 2d canvas");
  ctx.drawImage(source, p.sx, p.sy, p.sw, p.sh, 0, 0, p.dw, p.dh);
  let size = 0;
  // Step the quality down until the crop fits under the byte cap, and refuse it if it never does.
  for (let q = quality; q >= 0.4 - 1e-9; q -= 0.15) {
    const blob = await toBlob(canvas, q);
    size = blob.size;
    if (size <= maxBytes) return { mimeType: "image/jpeg", base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
  }
  throw new CropError(`the crop is ${size} bytes, over the ${maxBytes}-byte cap`);
}

// A photo the sender picked (any format the browser can decode), as one whole-frame JPEG.
export async function fileToJpeg(file: Blob, maxSide: number, quality: number): Promise<ImagePart> {
  const bitmap = await createImageBitmap(file);
  try {
    return await cropToJpeg(bitmap, { x: 0, y: 0, w: 1, h: 1 }, maxSide, quality);
  } finally {
    (bitmap as Partial<ImageBitmap>).close?.();
  }
}
