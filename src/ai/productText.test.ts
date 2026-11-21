import { expect, it, vi } from "vitest";
import type { ItemRead } from "../shared/itemRead";
import { clampProductText, groundProductRead, readProductText } from "./productText";

const read: ItemRead = {
  itemName: "Laptop", category: "laptop", labelText: "", volts: 0, milliampHours: 0, wattHours: 0, lithiumGrams: 0,
  liquid: false, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false, glassContainer: false, powder: false,
  batteryWords: true, retailBox: "cannot_tell", evidence: "item_seen",
};

it("zeroes a number that is not in the text", () => {
  const result = groundProductRead({ ...read, volts: 3.7, milliampHours: 5000, wattHours: 99, lithiumGrams: 2 }, "Battery: 3.7V 5000mAh");
  expect(result).toMatchObject({ volts: 3.7, milliampHours: 5000, wattHours: 0, lithiumGrams: 0 });
});

it("keeps a number written with a comma or a space", () => {
  for (const text of ["10,000 mAh", "10 000 mAh", "10\u202f000 mAh"]) {
    expect(groundProductRead({ ...read, milliampHours: 10000 }, text).milliampHours).toBe(10000);
  }
});

it("does not ground part of a larger, negative or decimal number", () => {
  expect(groundProductRead({ ...read, volts: 3, milliampHours: 500, wattHours: 99, lithiumGrams: 5 },
    "3.7V 5000mAh -99 Wh .5g")).toMatchObject({ volts: 0, milliampHours: 0, wattHours: 0, lithiumGrams: 0 });
});

it("drops label words the product text does not contain", () => {
  expect(groundProductRead({ ...read, labelText: "FLAMMABLE" }, "Soft cotton scarf").labelText).toBe("");
  expect(groundProductRead({ ...read, labelText: "Contains alcohol" }, "Contains\n alcohol.").labelText).toBe("Contains alcohol");
});

it("never marks product text as a label read", () => {
  expect(groundProductRead({ ...read, evidence: "label_read", retailBox: "sealed" }, "x"))
    .toMatchObject({ evidence: "item_seen", retailBox: "cannot_tell" });
});

it("cuts long text and says so", () => {
  expect(clampProductText("a".repeat(2500))).toEqual({ text: "a".repeat(2000), truncated: true });
});

it("discards a reply that did not run where we asked", async () => {
  const generate = vi.fn(async () => ({ text: JSON.stringify(read), source: "in_cloud" as const }));
  await expect(readProductText({ generate }, "x", "on_device", () => 0)).rejects.toMatchObject({ kind: "leak_guard" });
  generate.mockResolvedValueOnce({ text: JSON.stringify(read), source: "in_cloud", unreported: true } as Awaited<ReturnType<typeof generate>>);
  await expect(readProductText({ generate }, "x", "in_cloud", () => 0)).rejects.toMatchObject({ kind: "leak_guard" });
});

it("parses and grounds a valid reply, and refuses invalid output", async () => {
  const generate = vi.fn(async () => ({ text: JSON.stringify({ ...read, volts: 7 }), source: "on_device" as const }));
  const clock = vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(17);
  await expect(readProductText({ generate }, "Laptop, 3V", "on_device", clock))
    .resolves.toMatchObject({ read: { volts: 0 }, source: "on_device", ms: 7 });
  expect(generate).toHaveBeenCalledWith(expect.stringContaining(JSON.stringify("Laptop, 3V")), undefined, undefined);
  generate.mockResolvedValueOnce({ text: "{}", source: "on_device" });
  await expect(readProductText({ generate }, "Laptop", "on_device", () => 0)).rejects.toMatchObject({ kind: "invalid_output" });
});
