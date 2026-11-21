// Once the saved box opens, deletes the crops on this device that no item in it uses: left by a removal made
// before removals deleted crops, or by a delete that failed. A box that could not be opened is left alone,
// since its items are not all known. Which crops to keep is judged by the box as it is when the delete runs.
export interface SweepStore {
  ready: Promise<void>;
  getState(): { loadState?: "loading" | "ready" | "failed"; items: ReadonlyArray<{ cropKey: string | null }> };
}

export async function sweepCropsWhenOpen(store: SweepStore, deleteExcept: (keep: (key: string) => boolean) => Promise<number>): Promise<void> {
  await store.ready;
  if (store.getState().loadState !== "ready") return;
  await deleteExcept((key) => store.getState().items.some((i) => i.cropKey === key));
}
