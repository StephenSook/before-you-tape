import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImagePart } from "../ai/port";
import { CROP_LIMITS } from "../shared/cropLimits";
import { cropPlan, cropToJpeg, fileToJpeg } from "./crop";

// A real canvas (jsdom draws with the canvas package) with a pattern, so the JPEG is not trivial.
function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("no 2d context: is the canvas package installed?");
  for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) {
    ctx.fillStyle = (x + y) % 32 === 0 ? "#222" : "#ddd";
    ctx.fillRect(x, y, 16, 16);
  }
  return c;
}

// Reads the width and height from a JPEG's start-of-frame marker.
function jpegSize(p: ImagePart): { w: number; h: number } {
  const b = Uint8Array.from(atob(p.base64), (ch) => ch.charCodeAt(0));
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error("not a JPEG");
  let i = 2;
  while (i < b.length) {
    const marker = b[i + 1] as number;
    const len = ((b[i + 2] as number) << 8) | (b[i + 3] as number);
    if (marker >= 0xc0 && marker <= 0xc3) return { h: ((b[i + 5] as number) << 8) | (b[i + 6] as number), w: ((b[i + 7] as number) << 8) | (b[i + 8] as number) };
    i += 2 + len;
  }
  throw new Error("no start-of-frame marker");
}
const longestSide = (p: ImagePart) => Math.max(jpegSize(p).w, jpegSize(p).h);

describe("cropPlan", () => {
  it("maps a fractional box to source pixels and scales the longest side down to maxSide", () => {
    expect(cropPlan(1280, 720, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 768)).toEqual({ sx: 320, sy: 180, sw: 640, sh: 360, dw: 640, dh: 360 });
    expect(cropPlan(1280, 720, { x: 0, y: 0, w: 1, h: 1 }, 768)).toEqual({ sx: 0, sy: 0, sw: 1280, sh: 720, dw: 768, dh: 432 });
  });

  it("clamps a box that runs past the frame and refuses an empty one", () => {
    expect(cropPlan(100, 100, { x: 0.9, y: 0.9, w: 0.5, h: 0.5 }, 768)).toEqual({ sx: 90, sy: 90, sw: 10, sh: 10, dw: 10, dh: 10 });
    expect(() => cropPlan(100, 100, { x: 0.5, y: 0.5, w: 0, h: 0.2 }, 768)).toThrow(/empty/);
  });
});

describe("cropToJpeg", () => {
  it("outputs JPEG no larger than maxSide", async () => {
    const p = await cropToJpeg(canvas(1280, 720), { x: 0, y: 0, w: 1, h: 1 }, 768, 0.85);
    expect(p.mimeType).toBe("image/jpeg");
    expect(longestSide(p)).toBeLessThanOrEqual(768);
    expect(jpegSize(p)).toEqual({ w: 768, h: 432 });
  });

  it("keeps the crop under the shared byte cap", async () => {
    const p = await cropToJpeg(canvas(1280, 720), { x: 0, y: 0, w: 1, h: 1 }, CROP_LIMITS.maxSide, CROP_LIMITS.jpegQuality);
    expect(atob(p.base64).length).toBeLessThanOrEqual(CROP_LIMITS.maxBytes);
  });

  it("re-encodes at lower quality when a crop is over the byte cap, and refuses one it cannot bring under", async () => {
    const full = { x: 0, y: 0, w: 1, h: 1 };
    const atFirstQuality = atob((await cropToJpeg(canvas(800, 800), full, 768, 0.95, Number.POSITIVE_INFINITY)).base64).length;
    const small = await cropToJpeg(canvas(800, 800), full, 768, 0.95, atFirstQuality - 1);
    expect(atob(small.base64).length).toBeLessThan(atFirstQuality);
    await expect(cropToJpeg(canvas(800, 800), { x: 0, y: 0, w: 1, h: 1 }, 768, 0.95, 500)).rejects.toThrow(/byte/);
  });
});

describe("fileToJpeg", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("decodes any image the browser can read and outputs a whole-frame JPEG", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => canvas(2000, 1000)));
    const p = await fileToJpeg(new Blob(["x"], { type: "image/png" }), 768, 0.85);
    expect(jpegSize(p)).toEqual({ w: 768, h: 384 });
  });
});

describe("CROP_LIMITS", () => {
  it("is one shared limit: 768 px longest side, quality 0.85, and a byte cap between a crop and a 2 MB image", () => {
    expect(CROP_LIMITS).toEqual({ maxSide: 768, jpegQuality: 0.85, maxBytes: 500_000 });
  });
});
