import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../../eval/set/manifest.json";
import thumbs from "./thumbs.json";
import { thumbOf } from "./thumbs";

const file = (src: string) => readFileSync(join(process.cwd(), "public", src));
// A RIFF container's chunk names, to tell that no Exif or XMP block was kept.
const chunks = (b: Buffer) => { const out: string[] = []; for (let i = 12; i + 8 <= b.length; i += 8 + b.readUInt32LE(i + 4) + (b.readUInt32LE(i + 4) % 2)) out.push(b.toString("ascii", i, i + 4)); return out; };
const jpegSize = (b: Buffer) => { let i = 2; while (b[i + 1] !== 0xc0 && b[i + 1] !== 0xc2) i += 2 + b.readUInt16BE(i + 2); return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) }; };

describe("small copies of the eval photos", () => {
  it("gives every published photo a 240 px and a 480 px WebP, of the same shape, with no Exif or XMP", () => {
    expect(Object.keys(thumbs).sort()).toEqual(manifest.items.map((i) => i.itemId).sort());
    for (const item of manifest.items) {
      const t = thumbs[item.itemId as keyof typeof thumbs];
      expect({ width: t.photoWidth, height: t.photoHeight }, item.itemId).toEqual(jpegSize(file(item.photo)));
      expect(t.sizes.map((s) => s.width)).toEqual([240, 480]);
      for (const s of t.sizes) {
        const b = file(s.src);
        expect(b.toString("ascii", 0, 4) + b.toString("ascii", 8, 12), s.src).toBe("RIFFWEBP");
        expect(createHash("sha256").update(b).digest("hex"), s.src).toBe(s.sha256);
        expect(chunks(b).filter((c) => c === "EXIF" || c === "XMP "), s.src).toEqual([]);
        expect(Math.abs(s.height / s.width - t.photoHeight / t.photoWidth), s.src).toBeLessThan(0.01);
      }
    }
  });

  it("gives a page the small copy, its size and a srcset", () => {
    const t = thumbOf("own-18");
    expect(t).toEqual({ src: "/eval/thumbs/own-18-480.webp", width: 480, height: 640,
      srcSet: "/eval/thumbs/own-18-240.webp 240w, /eval/thumbs/own-18-480.webp 480w" });
  });
});
