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

// The test rule is added to the real rules, so the edition keeps the rules a parse requires.
const withRule = (patch: Record<string, unknown>) => ({ ...bundled, rules: [...bundled.rules, { ...validRule, ...patch }] });

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

  it("accepts a valid rule", () => expect(parseEdition(withRule({})).rules).toHaveLength(bundled.rules.length + 1));

  it("lets one rule id ask different questions, but refuses an exact duplicate", () => {
    const ask = (askId: string) => ({ ...validRule, id: "DATA-NEEDS-ANSWER", outcome: "check", askId });
    expect(parseEdition(bundled).rules.filter((r) => r.id === "DATA-NEEDS-ANSWER").map((r) => r.askId).sort())
      .toEqual(["battery_installed", "device_condition", "label_alcohol", "label_alcohol_free"]);
    expect(() => parseEdition({ ...bundled, rules: [...bundled.rules, ask("label_alcohol")] })).toThrow(EditionError);
    expect(() => parseEdition({ ...bundled, rules: [...bundled.rules, validRule, validRule] })).toThrow(EditionError);
    expect(() => parseEdition({ ...bundled, rules: [...bundled.rules, ask("no_such_question")] })).toThrow(EditionError);
  });

  it("rejects stored USPS wording fields, an unknown layer, an empty section", () => {
    expect(() => parseEdition(withRule({ shortQuote: "any text" }))).toThrow(EditionError);
    expect(() => parseEdition(withRule({ layer: "vibes" }))).toThrow(EditionError);
    expect(() => parseEdition(withRule({ section: "" }))).toThrow(EditionError);
  });

  it("rejects dates that do not exist on the calendar", () => {
    for (const bad of ["2026-13-01", "2026-02-30", "2026-00-10", "2026-11-31"]) {
      expect(() => parseEdition({ ...bundled, suspensions: { ...bundled.suspensions, checkedOn: bad } }), bad).toThrow(/checkedOn/);
    }
    expect(parseEdition({ ...bundled, suspensions: { ...bundled.suspensions, checkedOn: "2028-02-29" } }).suspensions.checkedOn).toBe("2028-02-29");
  });

  it("rejects a rule on a fact that does not exist", () => {
    expect(() => parseEdition(withRule({ when: { fact: "tagz", op: "has", value: "liquid" } }))).toThrow(/fact/);
    expect(() => parseEdition(withRule({ when: { fact: "battery.watts", op: "gt", value: 1 } }))).toThrow(/fact/);
  });

  it("rejects a tag the edition can never produce", () => {
    expect(() => parseEdition(withRule({ when: { fact: "tags", op: "has", value: "liquids" } }))).toThrow(/tag/);
    const pl = structuredClone(bundled.destinations.PH);
    pl.lines[0]!.matches = [{ tag: "liquids", effect: "take_out" }];
    expect(() => parseEdition({ ...bundled, destinations: { ...bundled.destinations, PH: pl } })).toThrow(/tag/);
  });

  it("rejects an exception answer the question does not offer", () => {
    const pl = structuredClone(bundled.destinations.PH);
    (pl.lines[0]!.matches as unknown[]) = [{ tag: "liquid", effect: "take_out", unlessAnswer: { questionId: "label_alcohol", answerId: "maybe" } }];
    expect(() => parseEdition({ ...bundled, destinations: { ...bundled.destinations, PH: pl } })).toThrow(/answerId/);
  });

  it("requires the questions the OK check depends on", () => {
    for (const askId of ["label_alcohol", "device_condition", "battery_installed"]) {
      const rules = bundled.rules.filter((r) => (r as { askId?: string }).askId !== askId || r.id !== "DATA-NEEDS-ANSWER");
      expect(() => parseEdition({ ...bundled, rules }), askId).toThrow(new RegExp(askId));
    }
  });

  it("requires the question rules and at least one export rule to be able to block a verdict", () => {
    const rescope = (askId: string, patch: Record<string, unknown>) => bundled.rules.map((r) =>
      r.id === "DATA-NEEDS-ANSWER" && (r as { askId?: string }).askId === askId ? { ...r, ...patch } : r);
    expect(() => parseEdition({ ...bundled, rules: rescope("device_condition", { scope: "note" }) })).toThrow(/device_condition/);
    expect(() => parseEdition({ ...bundled, rules: rescope("device_condition", { outcome: "note" }) })).toThrow(/device_condition/);
    const onlyNoteExport = bundled.rules.filter((r) => r.layer !== "usps_export")
      .concat([{ ...validRule, outcome: "note" }]);
    expect(() => parseEdition({ ...bundled, rules: onlyNoteExport })).toThrow(/export/);
  });

  it("rejects a bad predicate, a non-https url and a tolerance at the misread", () => {
    expect(() => parseEdition(withRule({ when: { fact: "category", op: "like", value: "x" } }))).toThrow(EditionError);
    expect(() => parseEdition(withRule({ url: "http://pe.usps.com/x" }))).toThrow(EditionError);
    expect(() => parseEdition({ ...bundled, limits: { ...bundled.limits, whTolerancePct: 3.8 } })).toThrow(EditionError);
  });

  const testDest = (patch: Record<string, unknown> = {}, line: Record<string, unknown> = {}) => ({
    code: "XX", name: "Testland", immUrl: "https://pe.usps.com/text/imm/xx.htm", immEdition: "2026-11-02",
    pageSha256: "0".repeat(64), reviewed: true, checkedOn: "2026-11-17", personReviewedOn: null, noListFurnished: false,
    lines: [{ lineId: "XX-P-01", section: "prohibitions", lineSha256: "1".repeat(64), ourWording: "Our words here.",
      matches: [{ tag: "liquid", effect: "take_out" }], ...line }],
    customsChecked: true, customsNotes: [], ...patch,
  });

  it("accepts a valid destination edition", () =>
    expect(parseEdition({ ...bundled, destinations: { XX: testDest() } }).destinations.XX?.name).toBe("Testland"));

  it("needs every listing line to match tags or record why it matches nothing", () => {
    const parse = (line: Record<string, unknown>) => () => parseEdition({ ...bundled, destinations: { XX: testDest({}, line) } });
    expect(parse({ matches: [] })).toThrow(/noMatch/);
    expect(parse({ matches: [], noMatch: { decision: "not_a_gift_item", reason: "" } })).toThrow(EditionError);
    expect(parse({ matches: [], noMatch: { decision: "vibes", reason: "Prison-made goods for sale." } })).toThrow(EditionError);
    expect(parse({ noMatch: { decision: "not_a_gift_item", reason: "Both is a contradiction." } })).toThrow(/noMatch/);
    expect(parse({ matches: [], noMatch: { decision: "not_a_gift_item", reason: "Prison-made goods for sale." } })).not.toThrow();
  });

  it("rejects an edition that has lost its export rules", () =>
    expect(() => parseEdition({ ...bundled, rules: [] })).toThrow(/rules/));

  it("rejects a reviewed listing with no lines, unless the listing gives no list", () => {
    expect(() => parseEdition({ ...bundled, destinations: { XX: testDest({ lines: [] }) } })).toThrow(/lines/);
    expect(parseEdition({ ...bundled, destinations: { XX: testDest({ lines: [], noListFurnished: true }) } }).destinations.XX?.lines)
      .toEqual([]);
  });

  it("rejects a quote field on a destination line", () =>
    expect(() => parseEdition({ ...bundled, destinations: { XX: testDest({}, { verbatim: "copied text" }) } })).toThrow(EditionError));

  it("records the person's review apart from the builder's read", () => {
    expect(parseEdition({ ...bundled, destinations: { XX: testDest({ personReviewedOn: "2026-11-19" }) } }).destinations.XX?.personReviewedOn)
      .toBe("2026-11-19");
    expect(() => parseEdition({ ...bundled, destinations: { XX: testDest({ personReviewedOn: "soon" }) } })).toThrow(EditionError);
    const { personReviewedOn: _gone, ...without } = testDest();
    void _gone;
    expect(() => parseEdition({ ...bundled, destinations: { XX: without } })).toThrow(EditionError);
  });

  it("hashes the same content the same whatever the key order", async () =>
    expect(await editionSha256(parseEdition(bundled))).toBe(await editionSha256(parseEdition(reorderKeys(bundled)))));

  it("names the service and resolves an unknown country", () => {
    expect(parseEdition(bundled).service).toBe("Priority Mail International");
    expect(resolveDestination(parseEdition(bundled), "ZZ").reviewState).toBe("not_loaded");
  });
});
