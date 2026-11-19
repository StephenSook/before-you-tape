import { beforeEach, describe, expect, it } from "vitest";
import { ed } from "../../tests/engine/helpers";
import { createBoxStore } from "./boxStore";
import { currentBoxId, localPersistence } from "./localPersistence";

const read = {
  itemName: "Perfume", category: "perfume_fragrance" as const, labelText: "EAU DE PARFUM ALCOHOL DENAT 50 ML", volts: 0, milliampHours: 0, wattHours: 0,
  lithiumGrams: 0, batteryWords: false, liquid: true, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false,
  glassContainer: false, powder: false, retailBox: "cannot_tell" as const, evidence: "label_read" as const,
};
let n = 0;
const make = (boxId: string) => createBoxStore({ edition: () => ed, persistence: localPersistence(localStorage), now: () => 0, today: () => "2026-11-20", newId: () => `x${n++}`, boxId });

describe("localPersistence", () => {
  beforeEach(() => localStorage.clear());

  it("keeps the box across a reload, without its label text, and re-judges it", async () => {
    const a = make("box-1");
    await a.ready;
    a.addManual(read);
    a.setDestination("PH");
    expect(localStorage.getItem("byt.box.box-1") ?? "").not.toContain("EAU DE PARFUM");
    const b = make("box-1");
    await b.ready;
    expect(b.getState().items).toHaveLength(1);
    expect(b.getState().destinationCode).toBe("PH");
    expect(b.getState().result.items[b.getState().items[0]!.itemId]?.level).toBe("take_out");
  });

  it("keeps no consent with the box, and ignores an answer an older save carried", async () => {
    localStorage.setItem("byt.box.box-c", JSON.stringify({ boxId: "box-c", destinationCode: "CA", items: [], cloudConsent: true }));
    expect(await localPersistence(localStorage).load("box-c")).not.toHaveProperty("cloudConsent");
    const s = make("box-c");
    await s.ready;
    s.setConsent(true);
    expect(localStorage.getItem("byt.box.box-c")).not.toContain("cloudConsent");
  });

  it("returns nothing for a box it never saved, and ignores a damaged record", async () => {
    expect(await localPersistence(localStorage).load("none")).toBeNull();
    localStorage.setItem("byt.box.bad", "{not json");
    expect(await localPersistence(localStorage).load("bad")).toBeNull();
  });

  describe("explicit operations", () => {
    const meta = { destinationCode: "PH", sources: { onDevice: 0, inCloud: 0, secondLooks: 0, rulesOnlyRechecks: 0, cloudFallbacks: 0 }, lastRecheckMs: null };
    const box = (id: string) => ({ itemId: id, read: { ...read, labelText: "" }, overrides: {}, answers: {}, quantity: 1, identityConfirmedBy: null,
      labelTags: [], readSource: "manual" as const, readMs: 0, secondLook: null, cropKey: null,
      customs: { description: "", lintOk: false, weightOz: null, valueUsd: null, countryOfOrigin: null, upc: null } });

    it("tells a missing box from a found one", async () => {
      const p = localPersistence(localStorage);
      expect(await p.loadBox("b1")).toEqual({ status: "missing" });
      await p.putMeta("b1", meta);
      const r = await p.loadBox("b1");
      expect(r.status === "found" && r.box.destinationCode).toBe("PH");
    });

    it("applies each operation to the box as stored now, so two tabs' items both stay", async () => {
      const tabA = localPersistence(localStorage);
      const tabB = localPersistence(localStorage);
      await tabA.putMeta("b1", meta);
      await tabA.putItem("b1", box("a"));
      await tabB.putItem("b1", box("b"));
      await tabA.putItem("b1", { ...box("a"), quantity: 2 });
      await tabB.deleteItem("b1", "zz");
      const r = await tabB.loadBox("b1");
      expect(r.status === "found" && r.box.items?.map((i) => [i.itemId, i.quantity])).toEqual([["a", 2], ["b", 1]]);
      await tabA.deleteItem("b1", "b");
      const r2 = await tabA.loadBox("b1");
      expect(r2.status === "found" && r2.box.items?.map((i) => i.itemId)).toEqual(["a"]);
      expect(r2.status === "found" && r2.box.destinationCode).toBe("PH");
    });
  });

  it("gives the same box id on every visit until it is cleared", () => {
    const first = currentBoxId(localStorage, () => "new-id");
    expect(first).toBe("new-id");
    expect(currentBoxId(localStorage, () => "other")).toBe("new-id");
  });
});
