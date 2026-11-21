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
        const keys = Object.keys(l).sort();
        expect(keys).toEqual(l.matches.length
          ? ["lineId", "lineSha256", "matches", "ourWording", "section"]
          : ["lineId", "lineSha256", "matches", "noMatch", "ourWording", "section"]);
      }
      expect(new Set(d.lines.map((l) => l.lineId)).size).toBe(d.lines.length);
    }
  });

  it("gives every line a tag match or a recorded reason it matches nothing", () => {
    for (const d of Object.values(ed.destinations)) {
      for (const l of d.lines) {
        if (l.matches.length) continue;
        expect(l.noMatch?.reason.length, l.lineId).toBeGreaterThan(10);
        if (l.section === "observations") expect(l.noMatch?.decision, l.lineId).toBe("observation");
      }
    }
  });

  it("gives only reasons that hold: an observation says where it shows, and none claims a USPS ban it lacks", () => {
    for (const d of Object.values(ed.destinations)) {
      for (const l of d.lines) {
        const reason = l.noMatch?.reason ?? "";
        // IMM 135.5 accepts some radioactive material, and no screen reads customsNotes.
        expect(reason, l.lineId).not.toMatch(/customs note|already bars/i);
        if (l.section === "observations") expect(reason, l.lineId).toMatch(/; shown on the Rules page\.$/);
      }
    }
  });

  it("maps the food and gift lines that a sender could pack", () => {
    const tagsOf = (code: string, id: string) => ed.destinations[code]?.lines.find((l) => l.lineId === id)?.matches.map((m) => m.tag);
    expect(tagsOf("CA", "CA-P-08")).toContain("margarine");
    expect(tagsOf("CA", "CA-P-06")).toContain("vaping");
    expect(tagsOf("CA", "CA-P-07")).toContain("bullion");
    expect(tagsOf("CA", "CA-R-08")).toContain("pet_food");
    expect(tagsOf("PH", "PH-P-02")).toContain("bullion");
    expect(tagsOf("PH", "PH-R-02")).toContain("plant");
  });

  it("maps the Philippines liquids and glass line", () =>
    expect(ed.destinations.PH?.lines.find((l) => l.lineId === "PH-P-01")?.matches).toEqual([
      { tag: "liquid", effect: "take_out" },
      { tag: "glass_fragile", effect: "take_out" },
      { tag: "easily_liquefiable", effect: "check" },
      { tag: "ceramic", effect: "check" },
      // A saved item keeps its tags but not its label text, so tags from before chocolate and margarine
      // counted as easily liquefiable still lead here.
      { tag: "chocolate", effect: "check" },
      { tag: "margarine", effect: "check" },
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
