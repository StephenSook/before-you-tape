// The /judge copies of the sample photos, with each brand, maker, logo or seal blurred (scripts/judge-thumbs.py,
// src/judge/brandMasks.json). The measured photos in public/eval/items, which the live read and the eval use, are not.
import judgeThumbs from "./judgeThumbs.json";
import maskedSamples from "./maskedSamples.json";
import { thumbOf, type Thumb } from "./thumbs";

export const judgeThumbOf = (itemId: string): Thumb | null => thumbOf(itemId, judgeThumbs);

// The sample lotion photo, full size, with its brand blurred: what the Pack page's sample shows and the /judge live
// read reads, checked byte for byte against this SHA-256 before use.
export const MASKED_SAMPLE = { url: maskedSamples["own-18"].photo, sha256: maskedSamples["own-18"].sha256 };
