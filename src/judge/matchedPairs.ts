// Matched pairs on /judge: two sides that differ in one thing, judged side by side by the app's own rules, so a
// judge sees both answers at once. A side can be fixed to a country (the same item, sent to two countries), or
// follow the country picked on the page (the same kind of item, new in its box or used). Each side is a real
// published photo with what its label says typed in, as in the sample box.
import type { ItemAnswers } from "../engine/types";
import type { ItemRead } from "../shared/itemRead";
import { SAMPLE_BOX } from "./sampleBox";

export interface PairSide {
  // The one thing that differs, in plain words: "To Canada", "New, in its sealed box".
  label: string;
  photo: string;
  width: number;
  height: number;
  photoAlt: string;
  credit: string;
  read: ItemRead;
  answers: ItemAnswers;
  // A country this side is always judged for; without one, it follows the country picked on the page.
  destination?: string;
}

export interface MatchedPair { id: string; title: string; left: PairSide; right: PairSide }

const lotion = SAMPLE_BOX.find((s) => s.itemId === "own-18");
if (!lotion) throw new Error("the sample box has no own-18");
// The published photo's own size (eval/set/manifest.json), so the page keeps its space before the photo loads.
const LOTION_SIDE = { photo: lotion.photo, width: 1200, height: 1600, photoAlt: lotion.alt, credit: lotion.credit, read: lotion.read, answers: {} };

export const MATCHED_PAIRS: readonly MatchedPair[] = [
  { id: "lotion-two-countries", title: "The same lotion, sent to two countries",
    left: { ...LOTION_SIDE, label: "To Canada", destination: "CA" },
    right: { ...LOTION_SIDE, label: "To the Philippines", destination: "PH" } },
];
