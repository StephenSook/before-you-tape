// The explicit operations a box is saved with: each one changes only what it names, so no tab or device ever
// writes another one's items back. A load says whether the box was found, is missing, or could not be read.
import type { BoxItem, BoxSources, BoxState } from "./boxStore";

export type LoadResult =
  | { status: "found"; box: Partial<BoxState> }
  | { status: "missing" }
  // The read itself failed (offline, refused, a query that errored): nothing may be written over the box.
  | { status: "failed"; error: string };

// The box's own details, written apart from its items.
export interface BoxMeta { destinationCode: string; sources: BoxSources; lastRecheckMs: number | null }

export interface BoxOps {
  loadBox(boxId: string): Promise<LoadResult>;
  // Creates the box (its owner the only member) or changes its details.
  putMeta(boxId: string, meta: BoxMeta): Promise<void>;
  // One item, with its second-look disputes, written together.
  putItem(boxId: string, item: BoxItem): Promise<void>;
  // One item and its disputes, removed together.
  deleteItem(boxId: string, itemId: string): Promise<void>;
}
