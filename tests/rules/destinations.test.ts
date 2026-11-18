import { describe, expect, it } from "vitest";
import bundled from "../../rules/edition.json";
import index from "../../rules/destinations/index.json";
import { parseEdition } from "../../src/engine/edition";

const ed = parseEdition(bundled);

describe("destination editions", () => {
  it("has reviewed, dated editions for Canada and the Philippines", () => {
    for (const code of ["CA", "PH"]) {
      const d = ed.destinations[code];
      expect(d, code).toBeDefined();
      expect(d?.reviewed).toBe(true);
      expect(d?.checkedOn).toMatch(/^2026-\d{2}-\d{2}$/);
      expect(d?.immEdition).toBe("2026-11-02");
      expect(d?.customsChecked).toBe(true);
      expect(d?.customsNotes.length).toBeGreaterThan(0);
      expect(d?.immUrl).toMatch(/^https:\/\/pe\.usps\.com\/text\/imm\//);
    }
  });

  it("keeps the person's desk pass separate: no date until a person re-reads each line", () => {
    for (const code of ["CA", "PH"]) {
      const on = ed.destinations[code]?.personReviewedOn;
      expect(on === null || /^2026-\d{2}-\d{2}$/.test(on ?? ""), code).toBe(true);
    }
  });

  it("stores a hash, an id and our wording for every line, never the source text", () => {
    expect(Object.keys(ed.destinations).length).toBeGreaterThanOrEqual(2);
    for (const d of Object.values(ed.destinations)) {
      expect(d.lines.length).toBeGreaterThan(5);
      for (const l of d.lines) {
        expect(l.lineSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(l.lineId).toMatch(new RegExp(`^${d.code}-[PRO]-\\d{2}$`));
        expect(l.ourWording.length).toBeGreaterThan(5);
        expect(Object.keys(l).sort()).toEqual(["lineId", "lineSha256", "matches", "ourWording", "section"]);
      }
      expect(new Set(d.lines.map((l) => l.lineId)).size).toBe(d.lines.length);
    }
  });

  it("maps the Philippines liquids and glass line", () =>
    expect(ed.destinations.PH?.lines.find((l) => l.lineId === "PH-P-01")?.matches).toEqual([
      { tag: "liquid", effect: "take_out" },
      { tag: "glass_fragile", effect: "take_out" },
      { tag: "easily_liquefiable", effect: "check" },
    ]));

  it("has no Canada line that matches liquids", () => {
    const tags = ed.destinations.CA?.lines.flatMap((l) => l.matches.map((m) => m.tag)) ?? [];
    expect(tags).not.toContain("liquid");
    expect(tags).not.toContain("easily_liquefiable");
  });

  it("lists every edition in the index under the same name and link", () => {
    expect(index.map((x) => x.code).sort()).toEqual(Object.keys(ed.destinations).sort());
    for (const x of index) {
      expect(ed.destinations[x.code]?.name).toBe(x.name);
      expect(ed.destinations[x.code]?.immUrl).toBe(x.immUrl);
    }
  });
});
