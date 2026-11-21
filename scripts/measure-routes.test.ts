import { describe, expect, it } from "vitest";
import { rowsFromQuery } from "./measure-routes";

const doc = (fields: Record<string, unknown>, createTime = "2026-11-20T10:00:00.123Z") => ({ document: { name: "projects/p/databases/(default)/documents/boxes/b/items/i", createTime, fields } });

describe("rowsFromQuery", () => {
  it("reads each item's route record from a runQuery reply, numbers given as strings or doubles", () => {
    const rows = rowsFromQuery([
      doc({ readSource: { stringValue: "on_device" }, readMs: { integerValue: "4321" }, secondLook: { mapValue: { fields: { ms: { doubleValue: 1200.5 }, reason: { stringValue: "x" } } } } }),
      doc({ readSource: { stringValue: "in_cloud" }, readMs: { doubleValue: 900.25 }, secondLook: { nullValue: null }, readFallback: { mapValue: { fields: { after: { stringValue: "503" }, route: { stringValue: "cloud_only" } } } } }),
      doc({ readSource: { stringValue: "manual" }, readMs: { integerValue: "0" } }),
    ]);
    expect(rows).toEqual([
      { readSource: "on_device", readMs: 4321, secondLookMs: 1200.5, fallback: null, createTime: "2026-11-20T10:00:00.123Z" },
      { readSource: "in_cloud", readMs: 900.25, secondLookMs: null, fallback: { after: "503", route: "cloud_only" }, createTime: "2026-11-20T10:00:00.123Z" },
      { readSource: "manual", readMs: 0, secondLookMs: null, fallback: null, createTime: "2026-11-20T10:00:00.123Z" },
    ]);
  });

  it("skips the empty rows a query can return, and a document with no read source", () => {
    expect(rowsFromQuery([{}, { readTime: "x" }, doc({ readMs: { integerValue: "1" } })])).toEqual([]);
  });
});
