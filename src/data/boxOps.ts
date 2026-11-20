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
  // True when the writes land only in this browser (sign-in failed): the store keeps them for the server.
  localOnly?(): boolean;
}

// The same JSON text for the same value, whatever order its keys were set in.
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

// A box store that keeps nothing: the box loads as missing and every write succeeds (the judge's sample box, tests).
export const noPersistence = (): BoxOps => ({
  loadBox: async () => ({ status: "missing" }),
  putMeta: async () => {},
  putItem: async () => {},
  deleteItem: async () => {},
});
