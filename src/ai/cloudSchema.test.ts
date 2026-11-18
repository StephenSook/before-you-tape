import { describe, expect, it } from "vitest";
import { itemReadJsonSchema } from "../shared/itemRead";
import { describeCloudSchema, destinationReadCloudSchema, itemReadCloudSchema } from "./cloudSchema";

// The SDK sends a Schema as its JSON form; compare that form, not the class instances.
interface SchemaJson {
  type: string;
  enum?: string[];
  required?: string[];
  properties?: Record<string, SchemaJson>;
  items?: SchemaJson;
}
const json = (s: unknown) => JSON.parse(JSON.stringify(s)) as SchemaJson;
const onDevice = () => itemReadJsonSchema() as SchemaJson;

// Reads one property and fails the test by name when it is missing.
function prop(s: SchemaJson, name: string): SchemaJson {
  const p = s.properties?.[name];
  if (!p) throw new Error(`schema has no property ${name}`);
  return p;
}
function items(s: SchemaJson): SchemaJson {
  if (!s.items) throw new Error("schema has no items");
  return s.items;
}

describe("cloud schemas", () => {
  it("matches the on-device schema", () => {
    const c = json(itemReadCloudSchema());
    const d = onDevice();
    expect(Object.keys(c.properties ?? {}).sort()).toEqual(Object.keys(d.properties ?? {}).sort());
    expect(prop(c, "category").enum).toEqual(prop(d, "category").enum);
  });

  it("requires every field, with the same type and enum values as the on-device schema", () => {
    const c = json(itemReadCloudSchema());
    const d = onDevice();
    expect([...(c.required ?? [])].sort()).toEqual([...(d.required ?? [])].sort());
    for (const [name, p] of Object.entries(d.properties ?? {})) {
      expect(prop(c, name).type, name).toBe(p.type);
      if (p.enum) expect(prop(c, name).enum, name).toEqual(p.enum);
    }
  });

  it("asks for one description line per item id", () => {
    const s = json(describeCloudSchema());
    expect(s.required).toEqual(["lines"]);
    expect(prop(s, "lines").type).toBe("array");
    const line = items(prop(s, "lines"));
    expect(Object.keys(line.properties ?? {}).sort()).toEqual(["description", "itemId"]);
    expect([...(line.required ?? [])].sort()).toEqual(["description", "itemId"]);
  });

  it("limits a destination read to the given tags and to take out or check", () => {
    const line = items(prop(json(destinationReadCloudSchema(["liquid", "alcohol"])), "lines"));
    expect(Object.keys(line.properties ?? {}).sort()).toEqual(["effect", "index", "plain", "tags"]);
    expect(prop(line, "index").type).toBe("integer");
    expect(items(prop(line, "tags")).enum).toEqual(["liquid", "alcohol"]);
    expect(prop(line, "effect").enum).toEqual(["take_out", "check"]);
  });

  it("refuses a destination read with no tags to choose from", () => expect(() => destinationReadCloudSchema([])).toThrow(/tag/));
});
