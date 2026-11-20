import { describe, expect, it } from "vitest";
import vectors from "../../tests/vectors/destinations.json";
import { ed, factsOf, withSuspended, withUpcoming } from "../../tests/engine/helpers";
import { evaluateDestination } from "./destination";
import { resolveDestination } from "./edition";
import type { DestinationEdition, ItemFacts } from "./types";

const hits = (x: ItemFacts, code: string) => evaluateDestination(x, {}, resolveDestination(ed, code));
const liquidLotion = factsOf({ category: "lotion_cream", tags: ["cosmetic", "easily_liquefiable", "label_text", "liquid"] });
const jarCream = factsOf({ category: "lotion_cream", tags: ["cosmetic", "easily_liquefiable"] });
const glassCandle = factsOf({ category: "candle", tags: ["glass_fragile"] });

describe("evaluateDestination", () => {
  it("passes liquid lotion to Canada and refuses it to the Philippines", () => {
    expect(hits(liquidLotion, "CA")).toEqual([]);
    expect(hits(liquidLotion, "PH")[0]).toMatchObject({ ruleId: "PH-P-01", level: "take_out", url: "https://pe.usps.com/text/imm/ps_006.htm" });
  });

  it("checks a cream and refuses glass for the Philippines", () => {
    expect(hits(jarCream, "PH")[0]?.level).toBe("check");
    expect(hits(glassCandle, "PH")[0]?.level).toBe("take_out");
  });

  it("gives one hit per line, at its most severe match", () => {
    const h = hits(liquidLotion, "PH").filter((x) => x.ruleId === "PH-P-01");
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ layer: "destination", text: expect.stringContaining("liquids") });
  });

  it("flags a suspended country and an unreviewed one", () => {
    const e = withSuspended(ed, ["CA"]);
    expect(evaluateDestination(liquidLotion, {}, resolveDestination(e, "CA")).map((x) => x.ruleId)).toContain("DEST-SUSPENDED");
    expect(hits(liquidLotion, "ZZ").map((x) => `${x.ruleId}:${x.level}`)).toEqual(["DATA-DEST-UNREVIEWED:check"]);
  });

  it("notes a suspension the post office has announced for later, and applies it from its date", () => {
    const e = withUpcoming(ed, "CA", "2026-11-29");
    const before = resolveDestination(e, "CA", undefined, "2026-11-28");
    expect(before).toMatchObject({ suspended: false, suspendsFrom: "2026-11-29" });
    const notes = evaluateDestination(liquidLotion, {}, before);
    expect(notes.map((x) => `${x.ruleId}:${x.level}`)).toEqual(["DEST-SUSPENSION-AHEAD:note"]);
    expect(notes[0]!.text).toBe("The post office stops taking mail to Canada on November 29, 2026. Mail this box before then.");
    const from = resolveDestination(e, "CA", undefined, "2026-11-29");
    expect(from).toMatchObject({ suspended: true });
    expect(from.suspendsFrom).toBeUndefined();
    expect(evaluateDestination(liquidLotion, {}, from).map((x) => x.ruleId)).toEqual(["DEST-SUSPENDED"]);
    // Without a date (a page that lists a country's rules, the shared vectors), nothing changes.
    const undated = resolveDestination(e, "CA");
    expect(undated.suspended).toBe(false);
    expect(undated.suspendsFrom).toBeUndefined();
  });

  it("follows the USPS suspension list updated 2026-11-20: no Republic of Congo, Canada from 2026-11-29", () => {
    expect(ed.suspensions).toMatchObject({ updated: "2026-11-20", url: "https://about.usps.com/newsroom/service-alerts/international/" });
    expect([...ed.suspensions.codes].sort()).toEqual(["AF", "BT", "CU", "HT", "IR", "KI", "SC", "SD", "SS", "TM", "YE"]);
    expect(ed.suspensions.upcoming).toEqual([{ code: "CA", from: "2026-11-29" }]);
    const congo = resolveDestination(ed, "CG", undefined, "2026-11-20");
    expect(congo.suspended).toBe(false);
    expect(evaluateDestination(liquidLotion, {}, congo).map((x) => x.ruleId)).not.toContain("DEST-SUSPENDED");
  });

  it("checks a country whose listing gives no list", () => {
    const empty: DestinationEdition = { ...ed.destinations.CA!, code: "KN", name: "Saint Kitts and Nevis", noListFurnished: true, lines: [] };
    const e = { ...ed, destinations: { ...ed.destinations, KN: empty } };
    expect(evaluateDestination(liquidLotion, {}, resolveDestination(e, "KN")).map((x) => x.ruleId)).toEqual(["DATA-DEST-NO-LIST"]);
  });

  it("drops a match when the sender gave its exception answer", () => {
    const pl = structuredClone(ed.destinations.PH!);
    pl.lines[0]!.matches = [{ tag: "liquid", effect: "take_out", unlessAnswer: { questionId: "label_alcohol", answerId: "no" } }];
    const e = { ...ed, destinations: { ...ed.destinations, PH: pl } };
    const dest = resolveDestination(e, "PH");
    expect(evaluateDestination(liquidLotion, { label_alcohol: "no" }, dest).map((x) => x.ruleId)).not.toContain("PH-P-01");
    expect(evaluateDestination(liquidLotion, {}, dest).map((x) => x.ruleId)).toContain("PH-P-01");
  });

  it("gives the expected hits for every destination vector", () => {
    expect(vectors.length).toBeGreaterThanOrEqual(15);
    for (const v of vectors) {
      const got = evaluateDestination(factsOf({ tags: v.tags }), {}, resolveDestination(ed, v.code)).map((x) => ({ ruleId: x.ruleId, level: x.level }));
      expect(got, v.name).toEqual(v.expect);
    }
  });
});
