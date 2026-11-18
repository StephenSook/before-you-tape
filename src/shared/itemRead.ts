// The one contract for what a model reads off an item. The field table below is the
// single source: the JSON Schema for the on-device model and the parser both come from it.

export const ITEM_CATEGORIES = [
  "perfume_fragrance", "nail_polish", "aerosol_spray", "hand_sanitizer", "lotion_cream",
  "liquid_toiletry", "makeup", "powder", "medicine", "alcohol_drink", "food_packaged",
  "chocolate", "coffee", "cooking_oil", "meat_product", "phone", "tablet", "laptop",
  "smartwatch", "earbuds", "power_bank", "loose_battery", "battery_toy", "musical_card",
  "other_electronics", "lighter_matches", "e_cigarette", "glue_paint", "knife_tool",
  "toy_gun", "candle", "jewelry_watch", "clothing", "shoes", "book_paper", "toy", "ceramic", "other",
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const RETAIL_BOX_VALUES = ["sealed", "open_or_none", "cannot_tell"] as const;
export const EVIDENCE_VALUES = ["label_read", "item_seen", "not_sure"] as const;

export interface ItemRead {
  itemName: string;
  category: ItemCategory;
  labelText: string; // at most LABEL_TEXT_MAX characters, "" when none
  volts: number; // 0 when not printed
  milliampHours: number;
  wattHours: number;
  lithiumGrams: number;
  batteryWords: boolean;
  liquid: boolean;
  pressurized: boolean;
  alcoholOnLabel: boolean;
  flammableOnLabel: boolean;
  glassContainer: boolean;
  powder: boolean;
  retailBox: (typeof RETAIL_BOX_VALUES)[number];
  evidence: (typeof EVIDENCE_VALUES)[number];
}

export const LABEL_TEXT_MAX = 160;

export interface ItemReadField {
  name: keyof ItemRead;
  kind: "string" | "number" | "boolean" | "enum";
  values?: readonly string[];
}

export const ITEM_READ_FIELDS: readonly ItemReadField[] = [
  { name: "itemName", kind: "string" },
  { name: "category", kind: "enum", values: ITEM_CATEGORIES },
  { name: "labelText", kind: "string" },
  { name: "volts", kind: "number" },
  { name: "milliampHours", kind: "number" },
  { name: "wattHours", kind: "number" },
  { name: "lithiumGrams", kind: "number" },
  { name: "batteryWords", kind: "boolean" },
  { name: "liquid", kind: "boolean" },
  { name: "pressurized", kind: "boolean" },
  { name: "alcoholOnLabel", kind: "boolean" },
  { name: "flammableOnLabel", kind: "boolean" },
  { name: "glassContainer", kind: "boolean" },
  { name: "powder", kind: "boolean" },
  { name: "retailBox", kind: "enum", values: RETAIL_BOX_VALUES },
  { name: "evidence", kind: "enum", values: EVIDENCE_VALUES },
];

export class InvalidReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidReadError";
  }
}

export function itemReadJsonSchema(): object {
  const properties: Record<string, object> = {};
  for (const f of ITEM_READ_FIELDS) {
    properties[f.name] = f.kind === "enum" ? { type: "string", enum: [...(f.values ?? [])] } : { type: f.kind };
  }
  return {
    type: "object",
    properties,
    required: ITEM_READ_FIELDS.map((f) => f.name),
    additionalProperties: false,
  };
}

function checkField(f: ItemReadField, value: unknown): void {
  const bad = (why: string) => new InvalidReadError(`${f.name}: ${why}`);
  switch (f.kind) {
    case "string":
      if (typeof value !== "string") throw bad("expected a string");
      return;
    case "number":
      // A number that is not printed is 0, so a negative or non-finite number is malformed.
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw bad("expected a number 0 or more");
      return;
    case "boolean":
      if (typeof value !== "boolean") throw bad("expected true or false");
      return;
    case "enum":
      if (typeof value !== "string" || !f.values?.includes(value)) throw bad("not an allowed value");
      return;
  }
}

export function parseItemRead(text: string): ItemRead {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new InvalidReadError("the reply is not JSON");
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new InvalidReadError("the reply is not a JSON object");
  }
  const record = data as Record<string, unknown>;
  const known = new Set<string>(ITEM_READ_FIELDS.map((f) => f.name));
  for (const key of Object.keys(record)) {
    if (!known.has(key)) throw new InvalidReadError(`${key}: not a field of the item read`);
  }
  for (const f of ITEM_READ_FIELDS) {
    if (!(f.name in record)) throw new InvalidReadError(`${f.name}: missing`);
    checkField(f, record[f.name]);
  }
  const read = record as unknown as ItemRead;
  return { ...read, labelText: Array.from(read.labelText).slice(0, LABEL_TEXT_MAX).join("") };
}
