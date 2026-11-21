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

  it("keeps the terms of the USPS line that change its meaning", () => {
    const wording = (code: string, id: string) => ed.destinations[code]?.lines.find((l) => l.lineId === id)?.ourWording ?? "";
    const terms: [string, string, RegExp][] = [
      ["CA", "CA-P-09", /^No issue of a publication with more than 5 percent of the ad space/], // any publication, not "mainly"
      ["CA", "CA-P-10", /where in Canada someone can get goods or services/], // USPS: may be obtained, bought or not
      ["CA", "CA-P-11", /specific items, or terms for selling or providing goods or services/],
      ["CA", "CA-P-12", /identical form in every edition distributed in its home country/], // free editions too
      ["CA", "CA-P-13", /Britain or any other British country/],
      ["CA", "CA-P-21", /prints in publications/],
      ["PH", "PH-R-01", /two 500 g plastic bottles of powdered coffee.*FDA Philippines/],
      // USPS: "are subject to authentication by the Philippine Consulate", for a fee of U.S. $30.
      ["PH", "PH-O-01", /^A commercial invoice .* needs authentication by the Philippine Consulate, for a US\$30 fee\.$/],
    ];
    for (const [code, id, term] of terms) expect(wording(code, id), id).toMatch(term);
    // USPS says any publication, and an ad aimed mainly at Canada, in the wording and in the reasons alike.
    for (const id of ["CA-P-09", "CA-P-10", "CA-P-11", "CA-P-12"]) {
      const l = ed.destinations.CA?.lines.find((x) => x.lineId === id);
      expect(`${l?.ourWording} ${l?.noMatch?.reason}`, id).not.toMatch(/magazine|Canada-only/i);
    }
  });

  it("says when the app is stricter than the lighter rules, and why", () => {
    // Canada lets a new lighter with no fuel through, and Pub 52 623 bars matches and lighters with fuel (Packaging
    // Instruction 3C sits under Class 3), not empty ones. A photo can't show that a lighter is empty, so the app
    // takes every lighter out and says that is its own choice.
    const l = ed.destinations.CA?.lines.find((x) => x.lineId === "CA-P-02");
    expect(l?.ourWording).toMatch(/Canada allows an empty new lighter, but a photo can't show that a lighter is empty, so the app takes every lighter out/);
    expect(l?.ourWording).not.toMatch(/USPS takes no lighters/);
    expect(l?.matches).toEqual([{ tag: "lighter", effect: "take_out" }]);
    const usps = ed.rules.find((r) => r.id === "USPS-INTL-MATCHES-LIGHTERS");
    expect(usps?.outcome).toBe("take_out");
    expect(usps?.ourWording).toMatch(/^Matches and lighters with fuel can't go by international mail\. A photo can't show/);
    expect(usps?.section).toBe("Pub 52 623 (Classes 3 and 4); Packaging Instruction 3C");
  });

  it("checks a toy gun to Canada under the firearms line, not the replica munitions line", () => {
    const line = (id: string) => ed.destinations.CA?.lines.find((l) => l.lineId === id);
    expect(line("CA-P-04")?.matches).toEqual([{ tag: "toy_gun", effect: "check" }]);
    expect(line("CA-P-04")?.ourWording).toMatch(/doesn't name toy guns/);
    // IMM 136.2 bars replica grenades and munitions in all international mail, and exempts toys that don't look
    // real; Canada's line and the Philippines' copies-of-weapons line match the same items.
    expect(line("CA-P-05")?.matches).toEqual([{ tag: "replica_explosive", effect: "check" }]);
    expect(ed.destinations.PH?.lines.find((l) => l.lineId === "PH-P-03")?.matches).toContainEqual({ tag: "replica_explosive", effect: "take_out" });
    const imm = ed.rules.find((r) => r.id === "USPS-INTL-REPLICA-EXPLOSIVE");
    expect(imm).toMatchObject({ section: "IMM 136.2", outcome: "check", url: "https://pe.usps.com/text/imm/immc1_015.htm" });
    expect(imm?.ourWording).toMatch(/toy that clearly doesn't look real/);
  });

  it("checks every medicine to the Philippines against its narcotics and psychotropic drugs line", () => {
    const l = ed.destinations.PH?.lines.find((x) => x.lineId === "PH-P-06");
    expect(l?.matches).toEqual([{ tag: "pharmaceutical", effect: "check" }]);
    expect(l?.ourWording).toMatch(/psychotropic drugs/);
    // Drug Facts and active-ingredient labels (hand sanitizer, sunscreen) carry the same tag, so the question
    // says when it applies.
    expect(l?.ourWording).toMatch(/If this is a medicine/);
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
