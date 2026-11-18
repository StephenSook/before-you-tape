import { describe, expect, it } from "vitest";
import bundled from "../../rules/edition.json";
import { EditionError, editionSha256, parseEdition, resolveDestination } from "./edition";

const validRule = {
  id: "TEST-RULE",
  layer: "usps_export",
  scope: "item",
  section: "Pub 52 623",
  url: "https://pe.usps.com/text/pub52/pub52c6_006.htm",
  basis: "summarized",
  ourWording: "A test rule written in our own words.",
  when: { fact: "category", op: "eq", value: "nail_polish" },
  outcome: "take_out",
};

const withRule = (patch: Record<string, unknown>) => ({ ...bundled, rules: [{ ...validRule, ...patch }] });

// Reverse every object's key order, deeply, to prove the hash ignores key order.
function reorderKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorderKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse().map(([k, v]) => [k, reorderKeys(v)]));
  }
  return value;
}

describe("rule edition", () => {
  it("pins the limits", () =>
    expect(parseEdition(bundled).limits).toMatchObject({
      maxCells: 4, maxBatteries: 2, cellMaxWh: 20, batteryMaxWh: 100, cellMaxLithiumG: 1, batteryMaxLithiumG: 2,
      seriesVoltsThreshold: 5, mixedOutcome: "check", unknownCountPolicy: "ask",
      staleDays: { usps_export: 120, destination: 60, suspensions: 21, customs: 60 },
    }));

  it("keeps the tolerance below the measured misread", () => {
    const t = parseEdition(bundled).limits.whTolerancePct;
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(3.8);
  });

  it("accepts a valid rule", () => expect(parseEdition(withRule({})).rules).toHaveLength(1));

  it("rejects stored USPS wording fields, an unknown layer, an empty section", () => {
    expect(() => parseEdition(withRule({ shortQuote: "any text" }))).toThrow(EditionError);
    expect(() => parseEdition(withRule({ layer: "vibes" }))).toThrow(EditionError);
    expect(() => parseEdition(withRule({ section: "" }))).toThrow(EditionError);
  });

  it("rejects a bad predicate, a non-https url and a tolerance at the misread", () => {
    expect(() => parseEdition(withRule({ when: { fact: "category", op: "like", value: "x" } }))).toThrow(EditionError);
    expect(() => parseEdition(withRule({ url: "http://pe.usps.com/x" }))).toThrow(EditionError);
    expect(() => parseEdition({ ...bundled, limits: { ...bundled.limits, whTolerancePct: 3.8 } })).toThrow(EditionError);
  });

  it("rejects a quote field on a destination line", () => {
    const dest = {
      code: "XX", name: "Testland", immUrl: "https://pe.usps.com/text/imm/xx.htm", immEdition: "2026-11-02",
      pageSha256: "0".repeat(64), reviewed: true, checkedOn: "2026-11-17", noListFurnished: false,
      lines: [{ lineId: "XX-P-01", section: "prohibitions", lineSha256: "1".repeat(64), ourWording: "Our words here.",
        matches: [{ tag: "liquid", effect: "take_out" }], verbatim: "copied text" }],
      customsChecked: true, customsNotes: [],
    };
    expect(() => parseEdition({ ...bundled, destinations: { XX: dest } })).toThrow(EditionError);
  });

  it("hashes the same content the same whatever the key order", async () =>
    expect(await editionSha256(parseEdition(bundled))).toBe(await editionSha256(parseEdition(reorderKeys(bundled)))));

  it("names the service and resolves an unknown country", () => {
    expect(parseEdition(bundled).service).toBe("Priority Mail International");
    expect(resolveDestination(parseEdition(bundled), "ZZ").reviewState).toBe("not_loaded");
  });
});
