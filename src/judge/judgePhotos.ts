// The /judge copies of the sample photos, with each brand, maker, logo or seal blurred (scripts/judge-thumbs.py,
// src/judge/brandMasks.json). The measured photos in public/eval/items, which the live read and the eval use, are not.
import judgeThumbs from "./judgeThumbs.json";
import { thumbOf, type Thumb } from "./thumbs";

export const judgeThumbOf = (itemId: string): Thumb | null => thumbOf(itemId, judgeThumbs);
