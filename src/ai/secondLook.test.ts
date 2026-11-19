import { describe, expect, it, vi } from "vitest";
import type { ItemRead } from "../shared/itemRead";
import type { ImagePart, ModelPort } from "./port";
import { ITEM_READ_PROMPT } from "./prompts";
import { mergeReads, readDisputes, runSecondLook, SECOND_LOOK_TEXT } from "./secondLook";

const img: ImagePart = { mimeType: "image/jpeg", base64: "AAAA" };
const base: ItemRead = {
  itemName: "Phone", category: "phone", labelText: "", volts: 0, milliampHours: 0, wattHours: 0, lithiumGrams: 0,
  batteryWords: false, liquid: false, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false, glassContainer: false,
  powder: false, retailBox: "cannot_tell", evidence: "item_seen",
};
const r = (patch: Partial<ItemRead>): ItemRead => ({ ...base, ...patch });
const clock = (...times: number[]) => { let i = 0; return () => times[Math.min(i++, times.length - 1)] as number; };
const answers = (read: ItemRead): ModelPort & { generate: ReturnType<typeof vi.fn> } => ({ generate: vi.fn(async () => ({ text: JSON.stringify(read), source: "in_cloud" as const })) });
const fails = (msg: string): ModelPort & { generate: ReturnType<typeof vi.fn> } => ({ generate: vi.fn(async () => { throw new Error(msg); }) });

describe("mergeReads", () => {
  it("merges cautiously", () => {
    expect(mergeReads(r({ alcoholOnLabel: false }), r({ alcoholOnLabel: true })).alcoholOnLabel).toBe(true);
    expect(mergeReads(r({ volts: 3.7, milliampHours: 2500, wattHours: 9.62 }), r({ volts: 3.7, milliampHours: 2600, wattHours: 9.62 })).milliampHours).toBe(2600);
    // No watt-hours on either side: the larger capacity stands, and the dispute asks the sender.
    expect(mergeReads(r({ milliampHours: 2500 }), r({ milliampHours: 2600 })).milliampHours).toBe(2600);
  });

  it("makes every hazard flag true when either read says so", () => {
    for (const flag of ["batteryWords", "liquid", "pressurized", "alcoholOnLabel", "flammableOnLabel", "glassContainer", "powder"] as const) {
      expect(mergeReads(r({ [flag]: true }), r({ [flag]: false }))[flag], flag).toBe(true);
      expect(mergeReads(r({ [flag]: false }), r({ [flag]: false }))[flag], flag).toBe(false);
    }
  });

  it("keeps the battery numbers of the read with more watt-hours, whole, and the larger lithium reading", () => {
    const m = mergeReads(r({ volts: 3.85, milliampHours: 5000, wattHours: 19.25 }), r({ volts: 3.85, milliampHours: 5000, wattHours: 1.92 }));
    expect([m.volts, m.milliampHours, m.wattHours]).toEqual([3.85, 5000, 19.25]);
    // A printed 105 Wh is never replaced by a tidier 95 Wh, and the numbers come from one read, never a mix.
    const over = mergeReads(r({ volts: 3.7, milliampHours: 25675, wattHours: 95 }), r({ volts: 3.6, milliampHours: 25675, wattHours: 105 }));
    expect([over.volts, over.milliampHours, over.wattHours]).toEqual([3.6, 25675, 105]);
    // Watt-hours not printed: volts times capacity decides.
    const computed = mergeReads(r({ volts: 7.4, milliampHours: 5000 }), r({ volts: 3.7, milliampHours: 5000 }));
    expect([computed.volts, computed.milliampHours]).toEqual([7.4, 5000]);
    expect(mergeReads(r({ lithiumGrams: 0.3 }), r({ lithiumGrams: 0.8 })).lithiumGrams).toBe(0.8);
    expect(mergeReads(r({ lithiumGrams: 2.5 }), r({ lithiumGrams: 0 })).lithiumGrams).toBe(2.5);
    expect(mergeReads(r({ volts: 3.7, milliampHours: 2500, wattHours: 9.25 }), r({ volts: 3.7, milliampHours: 2500, wattHours: 9.25 })).wattHours).toBe(9.25);
  });

  it("lists every verdict-changing fact the two reads disagree on, with both readings, and nothing they agree on", () => {
    expect(readDisputes(r({}), r({}))).toEqual({});
    const d = readDisputes(
      r({ category: "power_bank", retailBox: "open_or_none", volts: 3.7, milliampHours: 10000, wattHours: 37, lithiumGrams: 2.5, liquid: true }),
      r({ category: "phone", retailBox: "sealed", volts: 3.7, milliampHours: 10000, wattHours: 3.7, lithiumGrams: 0, liquid: false }),
    );
    expect(d).toEqual({
      category: { device: "power_bank", cloud: "phone", resolved: false },
      retailBox: { device: "open_or_none", cloud: "sealed", resolved: false },
      battery: { device: { volts: 3.7, milliampHours: 10000, wattHours: 37 }, cloud: { volts: 3.7, milliampHours: 10000, wattHours: 3.7 }, resolved: false },
      lithiumGrams: { device: 2.5, cloud: 0, resolved: false },
      liquid: { device: true, cloud: false, resolved: false },
    });
    for (const flag of ["batteryWords", "pressurized", "alcoholOnLabel", "flammableOnLabel", "glassContainer", "powder"] as const) {
      expect(readDisputes(r({ [flag]: true }), r({ [flag]: false }))[flag], flag).toEqual({ device: true, cloud: false, resolved: false });
    }
    // The name, the evidence and the label text are not verdict facts here; the store compares label words.
    expect(readDisputes(r({ itemName: "A", evidence: "label_read", labelText: "A" }), r({ itemName: "B", evidence: "item_seen", labelText: "B" }))).toEqual({});
  });

  it("takes the cloud's category, name and evidence, keeps a label when the cloud read none, and blurs a box disagreement", () => {
    const m = mergeReads(r({ category: "phone", itemName: "Phone", labelText: "IPHONE 15", evidence: "label_read", retailBox: "sealed" }),
      r({ category: "tablet", itemName: "Tablet", labelText: "", evidence: "item_seen", retailBox: "open_or_none" }));
    // Seen open by either read counts as open.
    expect(m).toMatchObject({ category: "tablet", itemName: "Tablet", labelText: "IPHONE 15", evidence: "item_seen", retailBox: "open_or_none" });
    expect(mergeReads(r({ retailBox: "sealed" }), r({ retailBox: "cannot_tell" })).retailBox).toBe("cannot_tell");
    expect(mergeReads(r({ labelText: "A" }), r({ labelText: "AB" })).labelText).toBe("AB");
  });

});

describe("runSecondLook", () => {
  const deviceRead = r({ volts: 3.7, milliampHours: 2500, wattHours: 9.62, labelText: "3.7V 2500mAh 9.62Wh", evidence: "label_read" });

  it("reads the same crop with the same prompt in the cloud and returns the merge, its time and whether the kind agreed", async () => {
    const cloud = answers(r({ volts: 3.7, milliampHours: 2600, wattHours: 9.62, labelText: "3.7V 2600mAh 9.62Wh", evidence: "label_read" }));
    const out = await runSecondLook(cloud, img, deviceRead, clock(100, 1100));
    // The same prompt and crop, with the check that the cloud is still allowed.
    expect(cloud.generate).toHaveBeenCalledWith(ITEM_READ_PROMPT, img, { allowed: expect.any(Function) });
    expect(out).toMatchObject({ ms: 1000, sameCategory: true });
    expect(out.merged.milliampHours).toBe(2600);
    expect(out.disputes).toEqual({ battery: { device: { volts: 3.7, milliampHours: 2500, wattHours: 9.62 }, cloud: { volts: 3.7, milliampHours: 2600, wattHours: 9.62 }, resolved: false } });
    expect((await runSecondLook(answers(r({ category: "tablet" })), img, deviceRead, clock(0, 1))).sameCategory).toBe(false);
  });

  it("returns the cloud's whole label text, not the clipped one", async () => {
    const label = `${"x".repeat(170)} FLAMMABLE`;
    const out = await runSecondLook(answers(r({ labelText: label })), img, deviceRead, clock(0, 1));
    expect(out.cloudLabel).toBe(label);
  });

  it("keeps check when second look fails", async () => {
    await expect(runSecondLook(fails("fetch-error 403"), img, deviceRead, clock(0, 1))).rejects.toMatchObject({ kind: "cloud_refused" });
    await expect(runSecondLook(fails("Failed to fetch"), img, deviceRead, clock(0, 1))).rejects.toMatchObject({ kind: "cloud_unreachable" });
  });

  it("uses the fallback model once after a 503 survives the retry", async () => {
    const fallback = answers(deviceRead);
    const cloud = fails("fetch-error 503");
    await expect(runSecondLook(cloud, img, deviceRead, clock(0, 1), fallback)).resolves.toMatchObject({ sameCategory: true });
    expect(cloud.generate).toHaveBeenCalledTimes(2);
    expect(fallback.generate).toHaveBeenCalledTimes(1);
  });

  it("has a plain sentence for every reason", () => {
    for (const reason of ["wh_mismatch", "battery_numbers", "not_sure", "hazard_no_label", "identity"] as const) {
      expect(SECOND_LOOK_TEXT[reason].length, reason).toBeGreaterThan(10);
    }
  });
});
