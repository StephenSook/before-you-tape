// Matched pairs on /judge: two of the same kind of item that differ in one thing, judged side by side by the app's
// own rules, so a judge sees both answers at once (a new phone in its box against a used one). Each side is the
// project owner's own photo, with what its label says typed in and the sender's answer to the question that
// differs. None is listed until those photos are in the repo; the section shows nothing until then.
import type { ItemAnswers } from "../engine/types";
import type { ItemRead } from "../shared/itemRead";

export interface PairSide {
  // The one thing that differs, in the sender's words: "New, in its sealed box".
  label: string;
  photo: string;
  width: number;
  height: number;
  photoAlt: string;
  credit: string;
  read: ItemRead;
  answers: ItemAnswers;
}

export interface MatchedPair { id: string; title: string; left: PairSide; right: PairSide }

export const MATCHED_PAIRS: readonly MatchedPair[] = [];
