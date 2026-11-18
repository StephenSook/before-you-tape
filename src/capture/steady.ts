// Hold-zone steady detector (plan Task 17). Classical image code only: it compares small grey frames
// inside the hold zone, fires once when something has sat still in the zone long enough and is sharp,
// and fires again only after the zone has cleared. Frames are never mirrored.

export interface Box { x: number; y: number; w: number; h: number }

export interface SteadyConfig {
  // Per-pixel grey difference that counts as a change.
  threshold: number;
  // Still frames in a row before an object counts as steady.
  steadyFrames: number;
  // Share of the zone that must differ from the empty zone for an object to be present.
  minChangedFraction: number;
  // Shortest time between two fires.
  cooldownMs: number;
  // Lowest Laplacian variance that counts as in focus.
  minSharpness: number;
  zone: Box;
}

export type SteadyEvent =
  | { type: "progress"; progress: number }
  | { type: "steady"; box: Box }
  | { type: "blurry" }
  | { type: "cannot_focus" }
  | { type: "cleared" };

const GIVE_UP_AFTER_MS = 3000;
const CLEAR_AFTER_FRAMES = 2;
const BOX_PAD = 0.04;

// Variance of the 3 by 3 Laplacian over a rectangle (end exclusive). Higher means sharper edges.
function laplacianVariance(gray: ArrayLike<number>, width: number, x0: number, y0: number, x1: number, y1: number): number {
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  for (let y = Math.max(1, y0); y < Math.min(y1, Math.floor(gray.length / width) - 1); y++) {
    for (let x = Math.max(1, x0); x < Math.min(x1, width - 1); x++) {
      const i = y * width + x;
      const v = (gray[i - width] as number) + (gray[i + width] as number) + (gray[i - 1] as number) + (gray[i + 1] as number) - 4 * (gray[i] as number);
      n++;
      sum += v;
      sumSq += v * v;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export function sharpness(gray: ArrayLike<number>, width: number, height: number): number {
  return laplacianVariance(gray, width, 0, 0, width, height);
}

export class SteadyDetector {
  private readonly zx0: number;
  private readonly zy0: number;
  private readonly zx1: number;
  private readonly zy1: number;
  private empty: Uint8ClampedArray | null = null;
  private prev: Uint8ClampedArray | null = null;
  private state: "empty" | "present" | "fired" = "empty";
  private still = 0;
  private clearFrames = 0;
  private lastFireMs = Number.NEGATIVE_INFINITY;
  private blurrySinceMs: number | null = null;

  constructor(private readonly cfg: SteadyConfig, private readonly width: number, private readonly height: number) {
    const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));
    this.zx0 = clamp(Math.floor(cfg.zone.x * width), width);
    this.zy0 = clamp(Math.floor(cfg.zone.y * height), height);
    this.zx1 = clamp(Math.ceil((cfg.zone.x + cfg.zone.w) * width), width);
    this.zy1 = clamp(Math.ceil((cfg.zone.y + cfg.zone.h) * height), height);
  }

  push(gray: Uint8ClampedArray, tMs: number): SteadyEvent | null {
    if (gray.length !== this.width * this.height) throw new Error(`frame size ${gray.length} does not match ${this.width} by ${this.height}`);
    if (!this.empty || !this.prev) {
      this.empty = gray.slice();
      this.prev = gray.slice();
      return null;
    }
    const { threshold, minChangedFraction } = this.cfg;
    const zonePixels = Math.max(1, (this.zx1 - this.zx0) * (this.zy1 - this.zy0));
    let present = 0;
    let moved = 0;
    let bx0 = this.zx1, by0 = this.zy1, bx1 = this.zx0, by1 = this.zy0;
    for (let y = this.zy0; y < this.zy1; y++) {
      for (let x = this.zx0; x < this.zx1; x++) {
        const i = y * this.width + x;
        const g = gray[i] as number;
        if (Math.abs(g - (this.empty[i] as number)) > threshold) {
          present++;
          if (x < bx0) bx0 = x;
          if (y < by0) by0 = y;
          if (x + 1 > bx1) bx1 = x + 1;
          if (y + 1 > by1) by1 = y + 1;
        }
        if (Math.abs(g - (this.prev[i] as number)) > threshold) moved++;
      }
    }
    this.prev = gray.slice();
    const isPresent = present / zonePixels >= minChangedFraction;
    const isMoving = moved / zonePixels >= minChangedFraction / 4;

    if (this.state === "fired") {
      if (isPresent) { this.clearFrames = 0; return null; }
      if (++this.clearFrames < CLEAR_AFTER_FRAMES) return null;
      this.reset(gray);
      return { type: "cleared" };
    }

    if (!isPresent) {
      // Learn the empty zone while nothing is in it, so slow light changes are not taken for an object.
      if (this.state === "empty" && !isMoving) this.empty = gray.slice();
      if (this.state === "present") this.reset(gray);
      return null;
    }

    this.state = "present";
    if (isMoving) { this.still = 0; return { type: "progress", progress: 0 }; }
    this.still++;
    if (this.still < this.cfg.steadyFrames) return { type: "progress", progress: this.still / this.cfg.steadyFrames };
    if (tMs - this.lastFireMs < this.cfg.cooldownMs) return { type: "progress", progress: 1 };

    if (laplacianVariance(gray, this.width, bx0, by0, bx1, by1) >= this.cfg.minSharpness) {
      this.state = "fired";
      this.lastFireMs = tMs;
      this.blurrySinceMs = null;
      return { type: "steady", box: this.boxFor(bx0, by0, bx1, by1) };
    }
    if (this.blurrySinceMs === null) {
      this.blurrySinceMs = tMs;
      return { type: "blurry" };
    }
    if (tMs - this.blurrySinceMs >= GIVE_UP_AFTER_MS) {
      // Stop asking: the item waits in the zone until it leaves, and the sender can add it by hand.
      this.state = "fired";
      this.blurrySinceMs = null;
      return { type: "cannot_focus" };
    }
    return null;
  }

  private reset(gray: Uint8ClampedArray): void {
    this.state = "empty";
    this.still = 0;
    this.clearFrames = 0;
    this.blurrySinceMs = null;
    this.empty = gray.slice();
  }

  // The changed pixels as fractions of the frame, padded a little and kept inside the zone.
  private boxFor(x0: number, y0: number, x1: number, y1: number): Box {
    const z = this.cfg.zone;
    const left = Math.max(z.x, x0 / this.width - BOX_PAD);
    const top = Math.max(z.y, y0 / this.height - BOX_PAD);
    const right = Math.min(z.x + z.w, x1 / this.width + BOX_PAD);
    const bottom = Math.min(z.y + z.h, y1 / this.height + BOX_PAD);
    return { x: left, y: top, w: right - left, h: bottom - top };
  }
}
