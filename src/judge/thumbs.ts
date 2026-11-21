// The small WebP copies of the eval photos (scripts/eval-thumbs.py), for pages that show a photo small.
import thumbs from "./thumbs.json";

export interface Thumb { src: string; width: number; height: number; srcSet: string }

export function thumbOf(itemId: string): Thumb | null {
  const t = (thumbs as Record<string, { sizes: { src: string; width: number; height: number }[] }>)[itemId];
  if (!t || t.sizes.length === 0) return null;
  const largest = t.sizes[t.sizes.length - 1]!;
  return { src: largest.src, width: largest.width, height: largest.height, srcSet: t.sizes.map((s) => `${s.src} ${s.width}w`).join(", ") };
}
