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

  it("returns nothing for a box it never saved, and ignores a damaged record", async () => {
    expect(await localPersistence(localStorage).load("none")).toBeNull();
    localStorage.setItem("byt.box.bad", "{not json");
    expect(await localPersistence(localStorage).load("bad")).toBeNull();
  });

  it("gives the same box id on every visit until it is cleared", () => {
    const first = currentBoxId(localStorage, () => "new-id");
    expect(first).toBe("new-id");
    expect(currentBoxId(localStorage, () => "other")).toBe("new-id");
  });
});
