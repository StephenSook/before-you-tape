import { describe, expect, it } from "vitest";
import {
  ITEM_CATEGORIES,
  ITEM_READ_FIELDS,
  InvalidReadError,
  itemReadJsonSchema,
  parseItemRead,
  type ItemRead,
} from "./itemRead";

const valid: ItemRead = {
  itemName: "Body lotion",
  category: "lotion_cream",
  labelText: "SHEA BODY LOTION 8 FL OZ",
  volts: 0,
  milliampHours: 0,
  wattHours: 0,
  lithiumGrams: 0,
  batteryWords: false,
  liquid: true,
  pressurized: false,
  alcoholOnLabel: false,
  flammableOnLabel: false,
  glassContainer: false,
  powder: false,
  retailBox: "sealed",
  evidence: "label_read",
};

describe("item read contract", () => {
  it("has 16 fields in spec order", () =>
    expect(ITEM_READ_FIELDS.map((f) => f.name)).toEqual([
      "itemName", "category", "labelText", "volts", "milliampHours", "wattHours", "lithiumGrams",
      "batteryWords", "liquid", "pressurized", "alcoholOnLabel", "flammableOnLabel", "glassContainer",
      "powder", "retailBox", "evidence",
    ]));

  // The spec's 37 categories plus "ceramic", added after the eval review (a mug had nowhere to go but "other").
  it("has the 37 spec categories and ceramic", () => {
    expect(ITEM_CATEGORIES).toHaveLength(38);
    expect(ITEM_CATEGORIES).toContain("ceramic");
    expect(ITEM_CATEGORIES[0]).toBe("perfume_fragrance");
    expect(ITEM_CATEGORIES.at(-1)).toBe("other");
  });

  it("builds a strict schema", () => {
    const s = itemReadJsonSchema() as {
      required: string[];
      additionalProperties: boolean;
      properties: Record<string, { type: string; enum?: string[] }>;
    };
    expect(s.required).toHaveLength(16);
    expect(s.properties.category?.enum).toHaveLength(38);
    expect(s.additionalProperties).toBe(false);
    expect(s.properties.volts?.type).toBe("number");
    expect(s.properties.liquid?.type).toBe("boolean");
    expect(s.properties.retailBox?.enum).toEqual(["sealed", "open_or_none", "cannot_tell"]);
    expect(s.properties.evidence?.enum).toEqual(["label_read", "item_seen", "not_sure"]);
  });

  it("parses a valid read", () => expect(parseItemRead(JSON.stringify(valid))).toEqual(valid));

  it("rejects bad reads and clips label text", () => {
    expect(() => parseItemRead("not json")).toThrow(InvalidReadError);
    expect(() => parseItemRead(JSON.stringify({ ...valid, category: "spaceship" }))).toThrow(InvalidReadError);
    expect(() => parseItemRead(JSON.stringify({ ...valid, volts: "3.7" }))).toThrow(InvalidReadError);
    expect(parseItemRead(JSON.stringify({ ...valid, labelText: "x".repeat(300) })).labelText).toHaveLength(160);
  });

  it("rejects a missing field, an extra field, a non-object and a non-finite number", () => {
    const missing: Partial<ItemRead> = { ...valid };
    delete missing.evidence;
    expect(() => parseItemRead(JSON.stringify(missing))).toThrow(InvalidReadError);
    expect(() => parseItemRead(JSON.stringify({ ...valid, hsCode: "3304" }))).toThrow(InvalidReadError);
    expect(() => parseItemRead("[]")).toThrow(InvalidReadError);
    expect(() => parseItemRead("null")).toThrow(InvalidReadError);
    expect(() => parseItemRead(JSON.stringify({ ...valid, retailBox: "maybe" }))).toThrow(InvalidReadError);
    expect(() => parseItemRead(JSON.stringify({ ...valid, liquid: "true" }))).toThrow(InvalidReadError);
    expect(() => parseItemRead(JSON.stringify({ ...valid, milliampHours: -5 }))).toThrow(InvalidReadError);
  });

  it("names the bad field in the error", () => {
    expect(() => parseItemRead(JSON.stringify({ ...valid, volts: "3.7" }))).toThrow(/volts/);
  });
});
