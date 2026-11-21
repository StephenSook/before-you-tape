import { describe, expect, it, vi } from "vitest";
import type { BoxMeta, BoxOps, LoadResult } from "./boxOps";
import type { BoxItem } from "./boxStore";
import { persistenceAfterSignIn, sweepUntilEmpty } from "./persistence";

const fake = () => ({
  loadBox: vi.fn<(boxId: string) => Promise<LoadResult>>(async () => ({ status: "found", box: { destinationCode: "PH" } })),
  putMeta: vi.fn<(boxId: string, meta: BoxMeta) => Promise<void>>(async () => {}),
  putItem: vi.fn<(boxId: string, item: BoxItem) => Promise<void>>(async () => {}),
  deleteItem: vi.fn<(boxId: string, itemId: string) => Promise<void>>(async () => {}),
}) satisfies BoxOps;
const meta: BoxMeta = { destinationCode: "CA", sources: { onDevice: 0, inCloud: 0, secondLooks: 0, rulesOnlyRechecks: 0, cloudFallbacks: 0 }, lastRecheckMs: null };

describe("persistenceAfterSignIn", () => {
  it("waits for sign-in, then sends every operation to Firestore, those made before it too", async () => {
    let signedIn!: (uid: string) => void;
    const signIn = new Promise<string>((r) => { signedIn = r; });
    const cloud = fake();
    const make = vi.fn(() => cloud);
    const p = persistenceAfterSignIn(signIn, make, fake());
    const early = p.putMeta("b1", meta);
    const loading = p.loadBox("b1");
    expect(make).not.toHaveBeenCalled();
    signedIn("alice");
    expect(await loading).toEqual({ status: "found", box: { destinationCode: "PH" } });
    await early;
    await p.deleteItem("b1", "i1");
    expect(make).toHaveBeenCalledWith("alice");
    expect(cloud.putMeta).toHaveBeenCalledWith("b1", meta);
    expect(cloud.deleteItem).toHaveBeenCalledWith("b1", "i1");
  });

  it("passes a whole-box delete to Firestore after sign-in, and does nothing when the box was only kept in this browser", async () => {
    const cloud = { ...fake(), deleteBox: vi.fn<(boxId: string) => Promise<void>>(async () => {}) };
    await persistenceAfterSignIn(Promise.resolve("alice"), () => cloud, fake()).deleteBox!("b1");
    expect(cloud.deleteBox).toHaveBeenCalledWith("b1");
    await expect(persistenceAfterSignIn(Promise.reject(new Error("offline")), vi.fn(), fake()).deleteBox!("b1")).resolves.toBeUndefined();
  });

  it("keeps the box in this browser when sign-in fails", async () => {
    const local = fake();
    const make = vi.fn();
    const p = persistenceAfterSignIn(Promise.reject(new Error("offline")), make, local);
    await p.putMeta("b1", meta);
    expect(await p.loadBox("b1")).toEqual({ status: "found", box: { destinationCode: "PH" } });
    expect(make).not.toHaveBeenCalled();
    expect(local.putMeta).toHaveBeenCalledWith("b1", meta);
  });
});

describe("sweepUntilEmpty", () => {
  it("deletes in batches of 400 and lists again until a list comes back empty", async () => {
    const lists = [Array.from({ length: 450 }, (_, i) => i), [999], []];
    const removed: number[] = [];
    await sweepUntilEmpty(async () => lists.shift() ?? [], async (refs) => { removed.push(refs.length); });
    expect(removed).toEqual([400, 50, 1]);
    expect(lists).toEqual([]);
  });

  it("gives up, without deleting the box, when every list finds more", async () => {
    await expect(sweepUntilEmpty(async () => [1], async () => {}, 3)).rejects.toThrow("kept getting new items");
  });
});
