import { describe, expect, it } from "vitest";
import { ed } from "../tests/engine/helpers";
import { deskLineHash, planDeskPass, type DeskPassResults } from "./apply-desk-pass";

const TODAY = "2026-11-20";

async function resultsFor(edition = ed, patch: (r: DeskPassResults) => void = () => {}): Promise<DeskPassResults> {
  const lines: DeskPassResults["lines"] = {};
  for (const d of Object.values(edition.destinations)) {
    for (const l of d.lines) lines[l.lineId] = { v: "same", h: await deskLineHash(l) };
  }
  const r: DeskPassResults = { checkedBy: "Stephen", checkedOn: "2026-11-19", builtFrom: "abc1234", lines };
  patch(r);
  return r;
}

describe("deskLineHash", () => {
  it("matches the desk-pass sheet generator's fingerprint for known lines", async () => {
    // Taken from research/build/desk-pass/gen.py's own h() on these two lines, so the two cannot drift.
    const line = (code: string, id: string) => ed.destinations[code]!.lines.find((l) => l.lineId === id)!;
    expect(await deskLineHash(line("PH", "PH-P-01"))).toBe("2595f9264b858e10abb98291d3cc9ccd393dd1119e3fd05d5e0c59d85e2f3593");
    expect(await deskLineHash(line("CA", "CA-P-04"))).toBe("64d281f6463e8b51cb9c6024a878ec103b709842db60447f1429f7ab4736d089");
  });
});

describe("planDeskPass", () => {
  it("sets every country whose lines are all the same", async () => {
    const plan = await planDeskPass(ed, await resultsFor(), TODAY);
    expect(plan.refusals).toEqual([]);
    expect(plan.countries.CA).toEqual({ set: true, blocking: [] });
    expect(plan.countries.PH).toEqual({ set: true, blocking: [] });
  });

  it("holds a country with a wrong line and names it", async () => {
    const plan = await planDeskPass(ed, await resultsFor(ed, (r) => { r.lines["CA-P-08"] = { ...r.lines["CA-P-08"]!, v: "wrong", note: "x" }; }), TODAY);
    expect(plan.countries.CA?.set).toBe(false);
    expect(plan.countries.CA?.blocking).toEqual(["CA-P-08: marked wrong"]);
    expect(plan.countries.PH?.set).toBe(true);
  });

  it("holds a country with a missing line", async () => {
    const plan = await planDeskPass(ed, await resultsFor(ed, (r) => { delete r.lines["PH-R-01"]; }), TODAY);
    expect(plan.countries.PH).toEqual({ set: false, blocking: ["PH-R-01: not answered"] });
  });

  it("voids a line whose content changed since the sheet was built", async () => {
    const plan = await planDeskPass(ed, await resultsFor(ed, (r) => { r.lines["PH-P-01"]!.h = "0".repeat(64); }), TODAY);
    expect(plan.countries.PH?.set).toBe(false);
    expect(plan.countries.PH?.blocking).toEqual(["PH-P-01: changed since the sheet was built, send it back to Stephen"]);
  });

  it("refuses a check dated after today, before the builder read, or not real", async () => {
    for (const [on, why] of [["2026-11-30", /after today/], ["2026-11-10", /before the builder/], ["2026-02-30", /real date/]] as const) {
      const plan = await planDeskPass(ed, await resultsFor(ed, (r) => { r.checkedOn = on; }), TODAY);
      expect(plan.refusals.join(" "), on).toMatch(why);
      expect(Object.values(plan.countries).some((c) => c.set), on).toBe(false);
    }
  });

  it("refuses an unknown line id and an answer that is not same or wrong", async () => {
    const unknown = await planDeskPass(ed, await resultsFor(ed, (r) => { r.lines["ZZ-P-01"] = { v: "same", h: "0".repeat(64) }; }), TODAY);
    expect(unknown.refusals.join(" ")).toMatch(/ZZ-P-01/);
    const bad = await planDeskPass(ed, await resultsFor(ed, (r) => { (r.lines["CA-P-01"] as { v: string }).v = "maybe"; }), TODAY);
    expect(bad.refusals.join(" ")).toMatch(/CA-P-01/);
  });
});
