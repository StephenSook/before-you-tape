import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import masks from "./brandMasks.json";
import judgeThumbs from "./judgeThumbs.json";
import manifest from "../../eval/set/manifest.json";
import { judgeThumbOf, MASKED_SAMPLE } from "./judgePhotos";
import maskedSamples from "./maskedSamples.json";
import { SAMPLE_BOX } from "./sampleBox";
import thumbs from "./thumbs.json";

const file = (src: string) => readFileSync(join(process.cwd(), "public", src));
// A RIFF container's chunk names, to tell that no Exif or XMP block was kept.
const chunks = (b: Buffer) => { const out: string[] = []; for (let i = 12; i + 8 <= b.length; i += 8 + b.readUInt32LE(i + 4) + (b.readUInt32LE(i + 4) % 2)) out.push(b.toString("ascii", i, i + 4)); return out; };
type Index = Record<string, { photoWidth: number; photoHeight: number; masks: number; sizes: { src: string; width: number; height: number; sha256: string }[] }>;
const index = judgeThumbs as Index;
const maskList = masks.masks as Record<string, unknown[]>;

describe("the /judge copies of the sample photos", () => {
  it("covers exactly the sample box, each photo with its masks", () => {
    expect(Object.keys(index).sort()).toEqual(SAMPLE_BOX.map((s) => s.itemId).sort());
    expect(Object.keys(maskList).sort()).toEqual(SAMPLE_BOX.map((s) => s.itemId).sort());
    for (const [id, t] of Object.entries(index)) expect(t.masks, id).toBe(maskList[id]!.length);
    // Every sample photo but the handmade mug shows a brand, a maker or a seal.
    expect(Object.entries(maskList).filter(([, m]) => m.length === 0).map(([id]) => id)).toEqual(["i20"]);
  });

  it("is a 240 px and a 480 px WebP per photo, of the photo's shape, with no Exif or XMP, as recorded", () => {
    for (const [id, t] of Object.entries(index)) {
      expect(t.sizes.map((s) => s.width), id).toEqual([240, 480]);
      for (const s of t.sizes) {
        expect(s.src).toBe(`/judge/thumbs/${id}-${s.width}.webp`);
        const b = file(s.src);
        expect(b.toString("ascii", 0, 4) + b.toString("ascii", 8, 12), s.src).toBe("RIFFWEBP");
        expect(createHash("sha256").update(b).digest("hex"), s.src).toBe(s.sha256);
        expect(chunks(b).filter((c) => c === "EXIF" || c === "XMP "), s.src).toEqual([]);
        expect(Math.abs(s.height / s.width - t.photoHeight / t.photoWidth), s.src).toBeLessThan(0.01);
      }
    }
  });

  // A masked copy is not the plain small copy other pages show.
  it("differs from the plain small copy wherever a region is masked", () => {
    const plain = thumbs as Record<string, { sizes: { sha256: string }[] }>;
    for (const [id, t] of Object.entries(index)) {
      if (t.masks === 0) continue;
      t.sizes.forEach((s, i) => expect(s.sha256, `${id} ${s.width}`).not.toBe(plain[id]!.sizes[i]!.sha256));
    }
  });

  it("gives the page the masked copy, its size and a srcset", () => {
    expect(judgeThumbOf("own-18")).toEqual({ src: "/judge/thumbs/own-18-480.webp", width: 480, height: 640,
      srcSet: "/judge/thumbs/own-18-240.webp 240w, /judge/thumbs/own-18-480.webp 480w" });
    expect(judgeThumbOf("own-01")).toBeNull();
  });
});

// The full-size sample photo the pages show and the live read reads, with the same masks: never the measured photo.
describe("the masked sample photo", () => {
  it("is a full-size JPEG of the lotion with its masks, recorded by its SHA-256, and not the measured photo", () => {
    expect(Object.keys(maskedSamples)).toEqual(["own-18"]);
    const s = maskedSamples["own-18"];
    expect(s.photo).toBe("/judge/samples/own-18.jpg");
    const b = file(s.photo);
    expect([b[0], b[1]]).toEqual([0xff, 0xd8]);
    expect(b.includes(Buffer.from("Exif\0\0")), "no Exif block").toBe(false);
    expect(createHash("sha256").update(b).digest("hex")).toBe(s.sha256);
    expect([s.widthPx, s.heightPx]).toEqual([1200, 1600]);
    expect(s.masks).toBe(maskList["own-18"]!.length);
    expect(s.sha256).not.toBe(manifest.items.find((i) => i.itemId === "own-18")!.photoSha256);
    expect(MASKED_SAMPLE).toEqual({ url: "/judge/samples/own-18.jpg", sha256: s.sha256 });
  });
});
