import { describe, expect, it, vi } from "vitest";
import type { BoxMeta, BoxOps, LoadResult } from "./boxOps";
import type { BoxItem } from "./boxStore";
import { deleteOrRetire, persistenceAfterSignIn, sweepUntilEmpty } from "./persistence";

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

describe("persistenceAfterSignIn loadCached", () => {
  it("reads the cached copy through Firestore after sign-in, and has none for a box kept in this browser", async () => {
    const cached: LoadResult = { status: "found", box: { destinationCode: "CA" } };
    const cloud = { ...fake(), loadCached: vi.fn(async () => cached) };
    expect(await persistenceAfterSignIn(Promise.resolve("alice"), () => cloud, fake()).loadCached!("b1")).toEqual(cached);
    expect(cloud.loadCached).toHaveBeenCalledWith("b1");
    expect(await persistenceAfterSignIn(Promise.reject(new Error("offline")), () => cloud, fake()).loadCached!("b1")).toEqual({ status: "missing" });
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

describe("deleteOrRetire", () => {
  const denied = Object.assign(new Error("denied"), { code: "permission-denied" });

  const no = async () => false;
  const yes = async () => true;

  it("deletes a box that is there, and retires the id of one that is not", async () => {
    const del = vi.fn(async () => {});
    const retire = vi.fn(async () => {});
    await deleteOrRetire(yes, del, retire, no);
    expect([del.mock.calls.length, retire.mock.calls.length]).toEqual([1, 0]);
    await deleteOrRetire(no, del, retire, no);
    expect([del.mock.calls.length, retire.mock.calls.length]).toEqual([1, 1]);
  });

  it("deletes the box another tab's first save created after the read, when the retire is refused for it", async () => {
    const reads = [false, true];
    const del = vi.fn(async () => {});
    await deleteOrRetire(async () => reads.shift()!, del, async () => { throw denied; }, no);
    expect(del).toHaveBeenCalledTimes(1);
  });

  it("is done when the retire is refused because the id was retired already", async () => {
    const del = vi.fn(async () => {});
    await deleteOrRetire(no, del, async () => { throw denied; }, yes);
    expect(del).not.toHaveBeenCalled();
  });

  it("fails when the retire is refused and the id is still not retired, never reporting a delete that did not happen", async () => {
    await expect(deleteOrRetire(no, vi.fn(), async () => { throw denied; }, no)).rejects.toThrow("not retired");
  });

  it("fails on any other refusal", async () => {
    await expect(deleteOrRetire(no, vi.fn(), async () => { throw new Error("offline"); }, no)).rejects.toThrow("offline");
  });
});
