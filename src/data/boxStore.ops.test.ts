// The box store saves by explicit operations: only what an edit changed, never on load, never over a read
// that failed, and an edit that has not reached the server is kept and sent again.
import { describe, expect, it, vi } from "vitest";
import { ed } from "../../tests/engine/helpers";
import type { ItemRead } from "../shared/itemRead";
import type { BoxMeta, BoxOps, LoadResult } from "./boxOps";
import { createBoxStore, type BoxItem, type JournalStore } from "./boxStore";
import { persistenceAfterSignIn } from "./persistence";

const base: ItemRead = {
  itemName: "Item", category: "other", labelText: "", volts: 0, milliampHours: 0, wattHours: 0, lithiumGrams: 0,
  batteryWords: false, liquid: false, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false,
  glassContainer: false, powder: false, retailBox: "cannot_tell", evidence: "label_read",
};
const shirt: ItemRead = { ...base, itemName: "Shirt", category: "clothing", evidence: "item_seen" };
const savedItem = (itemId: string): BoxItem => ({
  itemId, read: { ...shirt, itemName: "Clothing" }, overrides: {}, answers: {}, quantity: 1, identityConfirmedBy: "sender", labelTags: [],
  readSource: "manual", readMs: 0, secondLook: null, cropKey: null, addedAt: 1,
  customs: { description: "", lintOk: false, weightOz: null, valueUsd: null, countryOfOrigin: null, upc: null },
});
const sources = { onDevice: 0, inCloud: 0, secondLooks: 0, rulesOnlyRechecks: 0, cloudFallbacks: 0 };
const found = (items: BoxItem[], destinationCode = "PH"): LoadResult => ({ status: "found", box: { boxId: "b1", destinationCode, sources, items } });

// Box operations whose load answers when the test says so.
function ops(result: LoadResult = { status: "missing" }) {
  let answer: (r: LoadResult) => void = () => {};
  const loaded = new Promise<LoadResult>((r) => { answer = r; });
  const o = {
    loadBox: vi.fn<(boxId: string) => Promise<LoadResult>>(() => loaded),
    putMeta: vi.fn<(boxId: string, meta: BoxMeta) => Promise<void>>(async () => {}),
    putItem: vi.fn<(boxId: string, item: BoxItem) => Promise<void>>(async () => {}),
    deleteItem: vi.fn<(boxId: string, itemId: string) => Promise<void>>(async () => {}),
  } satisfies BoxOps;
  return { o, answer: () => answer(result), answerWith: (r: LoadResult) => answer(r) };
}
const memoryJournal = (): JournalStore => {
  const m = new Map<string, string>();
  return { read: (id: string) => { const s = m.get(id); return s ? JSON.parse(s) : null; }, write: (id: string, j: unknown) => { m.set(id, JSON.stringify(j)); } };
};
let n = 0;
const make = (o: BoxOps, journal: JournalStore = memoryJournal()) => createBoxStore({
  edition: () => ed, persistence: o, journal, now: () => 1000, today: () => "2026-11-20", newId: () => `n${n++}`, boxId: "b1",
});
const settle = () => new Promise((r) => setTimeout(r, 0));
const writes = (o: ReturnType<typeof ops>["o"]) => o.putMeta.mock.calls.length + o.putItem.mock.calls.length + o.deleteItem.mock.calls.length;

describe("saving by explicit operations", () => {
  it("writes nothing when a box loads, found or missing", async () => {
    for (const r of [found([savedItem("a")]), { status: "missing" } as LoadResult]) {
      const p = ops(r);
      const s = make(p.o);
      p.answer();
      await s.ready;
      await settle();
      expect(writes(p.o), r.status).toBe(0);
    }
  });

  it("writes only the item an edit changed, only the details for a new country, and removes only the item removed", async () => {
    const p = ops(found([savedItem("a"), savedItem("b")]));
    const s = make(p.o);
    p.answer();
    await s.ready;
    s.setQuantity("a", 2);
    await settle();
    expect(p.o.putItem.mock.calls.map((c) => [c[1].itemId, c[1].quantity])).toEqual([["a", 2]]);
    s.setDestination("CA");
    await settle();
    expect(p.o.putMeta.mock.calls.map((c) => c[1].destinationCode)).toEqual(["CA"]);
    s.remove("b");
    await settle();
    expect(p.o.deleteItem.mock.calls.map((c) => c[1])).toEqual(["b"]);
    expect(p.o.putItem).toHaveBeenCalledTimes(1);
  });

  it("holds edits made before the box loads, then writes only them over the loaded box", async () => {
    const p = ops(found([savedItem("a")], "PH"));
    const s = make(p.o);
    const b = s.addManual(shirt);
    s.setDestination("CA");
    await settle();
    expect(writes(p.o)).toBe(0);
    p.answer();
    await s.ready;
    await settle();
    expect(s.getState().items.map((i) => i.itemId)).toEqual(["a", b]);
    // The sender chose Canada while the box loaded, so that choice stands over the saved Philippines.
    expect(s.getState().destinationCode).toBe("CA");
    expect(p.o.putItem.mock.calls.map((c) => c[1].itemId)).toEqual([b]);
    expect(p.o.putMeta.mock.calls.map((c) => c[1].destinationCode)).toEqual(["CA"]);
  });

  it("keeps the saved country when the sender did not choose one while the box loaded", async () => {
    const p = ops(found([], "PH"));
    const s = make(p.o);
    s.addManual(shirt);
    p.answer();
    await s.ready;
    await settle();
    expect(s.getState().destinationCode).toBe("PH");
    // Nothing about the box itself changed, so its details are not written.
    expect(p.o.putMeta).not.toHaveBeenCalled();
  });

  it("never writes over a box whose read failed, says the edits are not saved, and saves them once a retry reads it", async () => {
    const p = ops({ status: "failed", error: "offline" });
    const s = make(p.o);
    const b = s.addManual(shirt);
    p.answer();
    await s.ready;
    await settle();
    expect(writes(p.o)).toBe(0);
    expect(s.getState().loadState).toBe("failed");
    expect(s.getState().unsaved).toEqual([b]);
    p.o.loadBox.mockResolvedValueOnce(found([savedItem("a")], "PH"));
    await s.retryLoad();
    await settle();
    expect(s.getState().loadState).toBe("ready");
    expect(s.getState().items.map((i) => i.itemId)).toEqual(["a", b]);
    expect(p.o.putItem.mock.calls.map((c) => c[1].itemId)).toEqual([b]);
    expect(s.getState().unsaved).toEqual([]);
  });

  it("creates a new box before its first item", async () => {
    const p = ops({ status: "missing" });
    const order: string[] = [];
    p.o.putMeta.mockImplementation(async () => { order.push("meta"); });
    p.o.putItem.mockImplementation(async () => { order.push("item"); });
    const s = make(p.o);
    p.answer();
    await s.ready;
    s.addManual(shirt);
    await settle();
    await settle();
    expect(order).toEqual(["meta", "item"]);
  });

  it("says an item is not saved only after its save fails, and sends it again on retry", async () => {
    const p = ops(found([]));
    const s = make(p.o);
    p.answer();
    await s.ready;
    p.o.putItem.mockRejectedValueOnce(new Error("offline"));
    const b = s.addManual(shirt);
    await settle();
    await settle();
    expect(s.getState().unsaved).toEqual([b]);
    s.retrySave();
    await settle();
    await settle();
    expect(p.o.putItem.mock.calls.filter((c) => c[1].itemId === b)).toHaveLength(2);
    expect(s.getState().unsaved).toEqual([]);
  });

  it("keeps an edit that never reached the server across a reload, and sends it then", async () => {
    const journal = memoryJournal();
    const first = ops(found([]));
    const a = make(first.o, journal);
    first.answer();
    await a.ready;
    first.o.putItem.mockRejectedValue(new Error("offline"));
    const b = a.addManual(shirt);
    await settle();
    await settle();
    // The page is reloaded: a new store, the same browser.
    const second = ops(found([]));
    const again = make(second.o, journal);
    second.answer();
    await again.ready;
    await settle();
    await settle();
    expect(again.getState().items.map((i) => i.itemId)).toEqual([b]);
    expect(second.o.putItem.mock.calls.map((c) => c[1].itemId)).toEqual([b]);
  });

  it("keeps edits saved only in this browser waiting for the server, and sends them once a later visit signs in", async () => {
    const journal = memoryJournal();
    const local = ops(found([]));
    const offline = persistenceAfterSignIn(Promise.reject(new Error("offline")), vi.fn(), local.o);
    const a = make(offline, journal);
    local.answer();
    await a.ready;
    const b = a.addManual(shirt);
    await a.settled();
    // Kept in this browser, and still shown as not saved: the server has not got it.
    expect(local.o.putItem.mock.calls.map((c) => c[1].itemId)).toEqual([b]);
    expect(a.getState().unsaved).toEqual([b]);
    const cloud = ops(found([]));
    const online = persistenceAfterSignIn(Promise.resolve("alice"), () => cloud.o, ops().o);
    const again = make(online, journal);
    cloud.answer();
    await again.ready;
    await again.settled();
    expect(cloud.o.putItem.mock.calls.map((c) => c[1].itemId)).toEqual([b]);
    expect(again.getState().unsaved).toEqual([]);
  });
});
