// Response schemas for the three cloud calls (spec 5.4). The item read is built from ITEM_READ_FIELDS,
// the same list the on-device JSON schema comes from, so the two cannot drift apart.
import { Schema, type ObjectSchema } from "firebase/ai";
import { ITEM_READ_FIELDS } from "../shared/itemRead";

export function itemReadCloudSchema(): ObjectSchema {
  const properties: Record<string, Schema> = {};
  for (const f of ITEM_READ_FIELDS) {
    properties[f.name] =
      f.kind === "enum" ? Schema.enumString({ enum: [...(f.values ?? [])] })
      : f.kind === "number" ? Schema.number()
      : f.kind === "boolean" ? Schema.boolean()
      : Schema.string();
  }
  return Schema.object({ properties });
}

// Customs descriptions for the whole box in one call: { lines: [{ itemId, description }] }.
export function describeCloudSchema(): ObjectSchema {
  return Schema.object({
    properties: {
      lines: Schema.array({
        items: Schema.object({ properties: { itemId: Schema.string(), description: Schema.string() } }),
      }),
    },
  });
}

// A country's listing mapped onto our tags: { lines: [{ index, tags[], effect, plain }] }. The model may
// only name tags from the list it was given, and only the two effects a listing line can have.
export function destinationReadCloudSchema(tags: string[]): ObjectSchema {
  if (tags.length === 0) throw new Error("destinationReadCloudSchema needs at least one tag to choose from");
  return Schema.object({
    properties: {
      lines: Schema.array({
        items: Schema.object({
          properties: {
            index: Schema.integer(),
            tags: Schema.array({ items: Schema.enumString({ enum: [...tags] }) }),
            effect: Schema.enumString({ enum: ["take_out", "check"] }),
            plain: Schema.string(),
          },
        }),
      }),
    },
  });
}
