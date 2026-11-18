import { describe, expect, it } from "vitest";
import { sharpness, SteadyDetector, type SteadyConfig, type SteadyEvent } from "./steady";

const W = 64;
const H = 36;
const cfg: SteadyConfig = {
  threshold: 24, steadyFrames: 6, minChangedFraction: 0.08, cooldownMs: 400, minSharpness: 200,
  zone: { x: 0.25, y: 0.15, w: 0.5, h: 0.7 },
};

type Frame = Uint8ClampedArray;
const frame = (px: (x: number, y: number) => number): Frame => {
  const f = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) f[y * W + x] = px(x, y);
  return f;
};
// A gently textured background, so "empty" is not a flat field (its Laplacian variance is about 24).
const bg = (x: number, y: number) => 112 + ((x + y) % 3);
const inBlock = (x: number, y: number, ox = 0) => x >= 24 + ox && x < 40 + ox && y >= 10 && y < 26;
const zoneEmpty = frame(bg);
const objectInZone = frame((x, y) => (inBlock(x, y) ? ((((x >> 1) + (y >> 1)) & 1) ? 235 : 20) : bg(x, y)));
const otherInZone = frame((x, y) => (inBlock(x, y) ? (((x + y) % 4 < 2) ? 240 : 30) : bg(x, y)));
// A soft bright blob with a gaussian edge: clearly present, but with no edges to focus on.
const blurredObjectInZone = frame((x, y) => bg(x, y) + (220 - bg(x, y)) * Math.exp(-((Math.hypot(x - 32, y - 18) / 6) ** 2)));
// Something moving at the left and right edges only, outside the hold zone.
const personAt = (t: number) => frame((x, y) => ((x < 10 || x > 54) && (y + t) % 6 < 3 ? 250 : bg(x, y)));

const repeat = (f: Frame, n: number): Frame[] => Array.from({ length: n }, () => f);
const movingObject = (n: number): Frame[] => Array.from({ length: n }, (_, i) =>
  frame((x, y) => (inBlock(x, y, (i % 8) - 4) ? ((((x >> 1) + (y >> 1)) & 1) ? 235 : 20) : bg(x, y))));
const feedTimed = (d: SteadyDetector, frames: Frame[], stepMs: number) => frames.map((f, i) => d.push(f, i * stepMs));
const feed = (d: SteadyDetector, frames: Frame[]) => feedTimed(d, frames, 33);
const steadies = (frames: Frame[]) => feed(new SteadyDetector(cfg, W, H), frames).filter((e): e is Extract<SteadyEvent, { type: "steady" }> => e?.type === "steady");

describe("SteadyDetector", () => {
  it("ignores motion outside the hold zone", () =>
    expect(steadies([zoneEmpty, ...Array.from({ length: 60 }, (_, t) => personAt(t))])).toHaveLength(0));

  it("fires once per object", () => expect(steadies([...repeat(zoneEmpty, 5), ...repeat(objectInZone, 40)])).toHaveLength(1));

  it("fires again only after the zone clears", () =>
    expect(steadies([zoneEmpty, ...repeat(objectInZone, 12), ...repeat(zoneEmpty, 12), ...repeat(otherInZone, 12)])).toHaveLength(2));

  it("does not fire while the object moves", () => expect(steadies([zoneEmpty, ...movingObject(40)])).toHaveLength(0));

  it("reports blurry, then gives up asking after 3 seconds", () => {
    const events = feedTimed(new SteadyDetector(cfg, W, H), [zoneEmpty, ...repeat(blurredObjectInZone, 120)], 33);
    expect(events.some((e) => e?.type === "blurry")).toBe(true);
    expect(events.some((e) => e?.type === "cannot_focus")).toBe(true);
    expect(events.some((e) => e?.type === "steady")).toBe(false);
  });

  it("reports progress while the object settles and a box inside the zone when it fires", () => {
    const events = feed(new SteadyDetector(cfg, W, H), [zoneEmpty, ...repeat(objectInZone, 12)]);
    expect(events.some((e) => e?.type === "progress" && e.progress > 0 && e.progress < 1)).toBe(true);
    const fired = events.find((e) => e?.type === "steady");
    if (fired?.type !== "steady") throw new Error("no steady event");
    const { box } = fired;
    expect(box.x).toBeGreaterThanOrEqual(cfg.zone.x);
    expect(box.y).toBeGreaterThanOrEqual(cfg.zone.y);
    expect(box.x + box.w).toBeLessThanOrEqual(cfg.zone.x + cfg.zone.w + 1e-9);
    expect(box.y + box.h).toBeLessThanOrEqual(cfg.zone.y + cfg.zone.h + 1e-9);
  });

  it("says the zone cleared after an object leaves", () =>
    expect(feed(new SteadyDetector(cfg, W, H), [zoneEmpty, ...repeat(objectInZone, 12), ...repeat(zoneEmpty, 12)]).some((e) => e?.type === "cleared")).toBe(true));

  it("refuses a frame of the wrong size", () => expect(() => new SteadyDetector(cfg, W, H).push(new Uint8ClampedArray(10), 0)).toThrow(/size/));
});

describe("sharpness", () => {
  it("scores a sharp frame above a blurred one", () => expect(sharpness(objectInZone, W, H)).toBeGreaterThan(sharpness(blurredObjectInZone, W, H)));
});
