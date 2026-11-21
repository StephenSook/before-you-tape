import { describe, expect, it, vi } from "vitest";
import { sweepCropsWhenOpen } from "./cropSweep";

type Item = { cropKey: string | null };
const store = (loadState: "ready" | "failed", items: Item[]) => ({ ready: Promise.resolve(), getState: () => ({ loadState, items }) });

describe("sweepCropsWhenOpen", () => {
  it("keeps only the crops of items still in the box once it opens", async () => {
    const deleteExcept = vi.fn(async (keep: (key: string) => boolean) => ["a", "b", "c"].filter((k) => !keep(k)).length);
    await sweepCropsWhenOpen(store("ready", [{ cropKey: "b" }, { cropKey: null }]), deleteExcept);
    const keep = deleteExcept.mock.calls[0]![0];
    expect(["a", "b", "c"].filter(keep)).toEqual(["b"]);
  });

  it("deletes nothing when the saved box could not be opened, since its items are not all known", async () => {
    const deleteExcept = vi.fn(async () => 0);
    await sweepCropsWhenOpen(store("failed", []), deleteExcept);
    expect(deleteExcept).not.toHaveBeenCalled();
  });

  it("judges which crops to keep by the box as it is when the delete runs, not when the box opened", async () => {
    const items: Item[] = [];
    const s = { ready: Promise.resolve(), getState: () => ({ loadState: "ready" as const, items }) };
    const deleteExcept = vi.fn(async (keep: (key: string) => boolean) => { items.push({ cropKey: "new" }); return keep("new") ? 0 : 1; });
    await sweepCropsWhenOpen(s, deleteExcept);
    expect(await deleteExcept.mock.results[0]!.value).toBe(0);
  });
});
