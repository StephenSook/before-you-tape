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
  it("after close, starts no write and keeps nothing more, and answers once the writes already out have landed", async () => {
    const p = ops({ status: "missing" });
    let land!: () => void;
    p.o.putMeta.mockImplementation(() => new Promise<void>((r) => { land = r; }));
    const journal = memoryJournal();
    const s = make(p.o, journal);
    p.answer();
    await s.ready;
    s.addManual(shirt);
    await settle();
    expect(p.o.putMeta).toHaveBeenCalledTimes(1);
    const first = s.getState().items[0]!.itemId;
    let closed = false;
    const closing = s.close().then(() => { closed = true; });
    s.addManual(shirt);
    s.retrySave();
    await settle();
    expect(closed).toBe(false);
    land();
    await closing;
    // The box's creation landed; its item was not sent after close, and the edit made after close shows on the page
    // but was neither sent nor kept here.
    expect(p.o.putItem).not.toHaveBeenCalled();
    expect(p.o.putMeta).toHaveBeenCalledTimes(1);
    expect(Object.keys(journal.read("b1")!.items)).toEqual([first]);
    expect(s.getState().items).toHaveLength(2);
  });

  it("after a delete that failed, reopens without writing anything when no edit was made meanwhile", async () => {
    const p = ops(found([savedItem("a")]));
    const journal = memoryJournal();
    const write = vi.spyOn(journal, "write");
    const s = make(p.o, journal);
    p.answer();
    await s.ready;
    await s.close();
    write.mockClear();
    // Another tab's unsent edit in the journal both tabs share stays as it is.
    s.reopen();
    await s.settled();
    expect(write).not.toHaveBeenCalled();
    expect(writes(p.o)).toBe(0);
  });

  it("after a delete that failed, reopens and sends the edits made while it was closed", async () => {
    const p = ops(found([savedItem("a")]));
    const s = make(p.o);
    p.answer();
    await s.ready;
    await s.close();
    s.addManual(shirt);
    await settle();
    expect(p.o.putItem).not.toHaveBeenCalled();
    s.reopen();
    await s.settled();
    expect(p.o.putItem).toHaveBeenCalledTimes(1);
    expect(s.getState().unsaved).toEqual([]);
  });

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

  it("knows no country until the box loads or the sender picks one", async () => {
    const p = ops(found([], "PH"));
    const s = make(p.o);
    expect(s.getState().destinationKnown).toBe(false);
    p.answer();
    await s.ready;
    expect(s.getState().destinationKnown).toBe(true);
    const q = ops(found([], "PH"));
    const t = make(q.o);
    t.setDestination("CA");
    expect(t.getState().destinationKnown).toBe(true);
    expect(t.getState().destinationCode).toBe("CA");
  });

  // A server whose item writes wait until the test lets each one land (or fail), and which keeps what landed.
  function slowServer() {
    const stored = new Map<string, BoxItem>();
    const waiting: Array<{ id: string; land: () => void; fail: () => void }> = [];
    const o = {
      loadBox: vi.fn<(boxId: string) => Promise<LoadResult>>(async () => ({ status: "found", box: { boxId: "b1", destinationCode: "CA", sources, items: [...stored.values()] } })),
      putMeta: vi.fn<(boxId: string, meta: BoxMeta) => Promise<void>>(async () => {}),
      putItem: vi.fn<(boxId: string, item: BoxItem) => Promise<void>>((_b, item) => new Promise<void>((resolve, reject) => {
        waiting.push({ id: item.itemId, land: () => { stored.set(item.itemId, item); resolve(); }, fail: () => reject(new Error("offline")) });
      })),
      deleteItem: vi.fn<(boxId: string, itemId: string) => Promise<void>>(async (_b, itemId) => { stored.delete(itemId); }),
    } satisfies BoxOps;
    const next = (id: string) => {
      const i = waiting.findIndex((w) => w.id === id);
      if (i < 0) throw new Error(`no write waiting for ${id}`);
      return waiting.splice(i, 1)[0]!;
    };
    return { o, stored, land: (id: string) => next(id).land(), fail: (id: string) => next(id).fail() };
  }

  it("deletes an item removed while its first save was still on the way, so a reload does not bring it back", async () => {
    const srv = slowServer();
    const s = make(srv.o);
    await s.ready;
    const a = s.addManual(shirt);
    await settle();
    s.remove(a);
    srv.land(a);
    await s.settled();
    expect(srv.o.deleteItem.mock.calls.map((c) => c[1])).toEqual([a]);
    expect(srv.stored.has(a)).toBe(false);
    expect(s.getState().unsaved).toEqual([]);
    const again = make(srv.o);
    await again.ready;
    expect(again.getState().items).toEqual([]);
  });

  it("removes and adds again while the first save is on the way: the first goes, the second stays", async () => {
    const srv = slowServer();
    const s = make(srv.o);
    await s.ready;
    const a = s.addManual(shirt);
    await settle();
    s.remove(a);
    const b = s.addManual(shirt);
    srv.land(a);
    await settle();
    await settle();
    srv.land(b);
    await s.settled();
    expect(srv.o.deleteItem.mock.calls.map((c) => c[1])).toEqual([a]);
    expect([...srv.stored.keys()]).toEqual([b]);
    expect(s.getState().unsaved).toEqual([]);
  });

  it("sends no delete for an item whose first save failed after it was removed: the server never had it", async () => {
    const srv = slowServer();
    const s = make(srv.o);
    await s.ready;
    const a = s.addManual(shirt);
    await settle();
    s.remove(a);
    srv.fail(a);
    await s.settled();
    expect(srv.o.deleteItem).not.toHaveBeenCalled();
    expect(srv.stored.size).toBe(0);
    expect(s.getState().unsaved).toEqual([]);
  });

  it("deletes an item whose first save landed under a newer edit, even when the edit's save fails after removal", async () => {
    const srv = slowServer();
    const s = make(srv.o);
    await s.ready;
    const a = s.addManual(shirt);
    await settle();
    s.setQuantity(a, 2);
    srv.land(a);
    await settle();
    await settle();
    s.remove(a);
    srv.fail(a);
    await s.settled();
    expect(srv.o.deleteItem.mock.calls.map((c) => c[1])).toEqual([a]);
    expect(srv.stored.has(a)).toBe(false);
    expect(s.getState().unsaved).toEqual([]);
    const again = make(srv.o);
    await again.ready;
    expect(again.getState().items).toEqual([]);
  });

  it("saves a change back to the saved value made while another save of the item is out", async () => {
    const srv = slowServer();
    const s = make(srv.o);
    await s.ready;
    const a = s.addManual(shirt);
    await settle();
    srv.land(a);
    await s.settled();
    s.setQuantity(a, 3);
    await settle();
    s.setQuantity(a, 1);
    srv.land(a);
    await settle();
    await settle();
    // The first save, the change to 3, and the change back to 1.
    expect(srv.o.putItem.mock.calls.map((c) => c[1].quantity)).toEqual([1, 3, 1]);
    srv.land(a);
    await s.settled();
    expect(srv.stored.get(a)?.quantity).toBe(1);
    expect(s.getState().unsaved).toEqual([]);
    const again = make(srv.o);
    await again.ready;
    expect(again.getState().items.find((i) => i.itemId === a)?.quantity).toBe(1);
  });

  it("does not send an item again when an unrelated edit re-records the copy already on its way", async () => {
    const srv = slowServer();
    const s = make(srv.o);
    await s.ready;
    const a = s.addManual(shirt);
    await settle();
    srv.land(a);
    await s.settled();
    s.setQuantity(a, 3);
    await settle();
    // Another item's edit records every item again while the save of 3 is out: the same value, a new copy.
    const b = s.addManual({ ...shirt, itemName: "Socks" });
    await settle();
    srv.land(a);
    await settle();
    await settle();
    srv.land(b);
    await settle();
    await settle();
    expect(srv.o.putItem.mock.calls.filter((c) => c[1].itemId === a).map((c) => c[1].quantity)).toEqual([1, 3]);
    await s.settled();
    expect(s.getState().unsaved).toEqual([]);
  });
});
