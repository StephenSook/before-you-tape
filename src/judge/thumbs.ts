// The small WebP copies of the eval photos (scripts/eval-thumbs.py), for pages that show a photo small.
import thumbs from "./thumbs.json";

export interface Thumb { src: string; width: number; height: number; srcSet: string }

export type ThumbIndex = Record<string, { sizes: { src: string; width: number; height: number }[] }>;

export function thumbOf(itemId: string, index: ThumbIndex = thumbs): Thumb | null {
  const t = index[itemId];
  if (!t || t.sizes.length === 0) return null;
  const largest = t.sizes[t.sizes.length - 1]!;
  return { src: largest.src, width: largest.width, height: largest.height, srcSet: t.sizes.map((s) => `${s.src} ${s.width}w`).join(", ") };
}
