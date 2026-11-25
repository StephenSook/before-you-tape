import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../src/engine/edition";
import type { Approval, Reviews } from "../src/rules/reviews";
import { ed } from "../tests/engine/helpers";
import { LAST_JUDGING_DAY, releaseGateProblems } from "./release-gate";

const TODAY = "2026-11-26";
// A person has checked every listing on `on`, and the service suspensions were re-read on `suspensionsOn`.
const withReview = (on: string, suspensionsOn = "2026-11-25") => {
  const e = structuredClone(ed);
  for (const d of Object.values(e.destinations)) d.personReviewedOn = on;
  e.suspensions.checkedOn = suspensionsOn;
  return e;
};

describe("releaseGateProblems", () => {
  it("fails while any bundled listing has not been checked by a person", () => {
    const problems = releaseGateProblems(ed, TODAY);
    expect(problems.some((p) => p.startsWith("CA:"))).toBe(true);
    expect(problems.some((p) => p.startsWith("PH:"))).toBe(true);
  });

  it("passes once a person has checked every listing and every layer stays fresh through judging", () =>
    expect(releaseGateProblems(withReview("2026-11-19"), TODAY)).toEqual([]));

  it("fails a person check dated after today", () => {
    const problems = releaseGateProblems(withReview("2026-11-30"), TODAY);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/after today/);
  });

  it("fails a person check older than the destination freshness limit", () => {
    const problems = releaseGateProblems(withReview("2026-09-01"), TODAY);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/older than 60 days/);
  });

  it("fails when a layer the app shows would turn stale before judging ends", () => {
    expect(LAST_JUDGING_DAY).toBe("2026-12-16");
    const problems = releaseGateProblems(withReview("2026-11-19", "2026-11-17"), TODAY);
    expect(problems).toEqual([
      expect.stringMatching(/^CA: the suspensions layer would read stale on 2026-12-16/),
      expect.stringMatching(/^PH: the suspensions layer would read stale on 2026-12-16/),
    ]);
  });

  it("uses the app's own layer rule: 21 days before the last judging day passes, 22 fails", () => {
    expect(releaseGateProblems(withReview("2026-11-19", "2026-11-25"), TODAY)).toEqual([]);
    expect(releaseGateProblems(withReview("2026-11-19", "2026-11-24"), TODAY)).toHaveLength(2);
  });

  it("fails an impossible today instead of passing", () =>
    expect(releaseGateProblems(withReview("2026-11-19"), "2026-13-40")).toEqual(["today is not a real date: 2026-13-40"]));

  it("fails an edition with no listings at all", () => {
    expect(releaseGateProblems({ ...ed, destinations: {} }, TODAY)).toEqual(["the edition has no destination listings"]);
  });

  // An approval as a whole (rules/reviews.json): two AI reviews checked each line, and the project owner approved
  // the lines, which must still be the ones approved.
  describe("with an approval of the lines as a whole", () => {
    const fresh = withReview("2026-11-19");
    for (const d of Object.values(fresh.destinations)) d.personReviewedOn = null;
    const linesOf = (code: string) => createHash("sha256").update(canonicalJson(fresh.destinations[code]!.lines)).digest("hex");
    const approval = (code: string, over: Partial<Approval> = {}): Approval => ({
      linesSha256: linesOf(code), aiCheckedOn: "2026-11-21", aiCheck: "Two AI reviews.", personApprovedOn: "2026-11-21",
      personApprovedBy: "the project owner", personApproval: "Approved as a whole, not line by line.", restatedOn: "2026-11-25", ...over,
    });
    const reviews = (over: Partial<Approval> = {}): Reviews => ({ listings: { CA: approval("CA", over), PH: approval("PH", over) } });

    it("passes while every listing's lines are the approved ones and both checks are recent", () =>
      expect(releaseGateProblems(fresh, TODAY, LAST_JUDGING_DAY, reviews())).toEqual([]));

    it("fails a listing whose lines changed after the approval", () => {
      const problems = releaseGateProblems(fresh, TODAY, LAST_JUDGING_DAY, { listings: { ...reviews().listings, CA: approval("CA", { linesSha256: "0".repeat(64) }) } });
      expect(problems).toEqual([expect.stringMatching(/^CA: the lines changed after the approval/)]);
    });

    it("fails an approval or an AI check dated after today, or older than the destination limit", () => {
      expect(releaseGateProblems(fresh, TODAY, LAST_JUDGING_DAY, reviews({ personApprovedOn: "2026-11-30", restatedOn: "2026-11-30" }))[0]).toMatch(/after today/);
      expect(releaseGateProblems(fresh, TODAY, LAST_JUDGING_DAY, reviews({ aiCheckedOn: "2026-09-01" }))[0]).toMatch(/older than 60 days/);
    });

    it("still fails a listing with neither a line-by-line check nor an approval", () => {
      const problems = releaseGateProblems(fresh, TODAY, LAST_JUDGING_DAY, { listings: { CA: approval("CA") } });
      expect(problems).toEqual([expect.stringMatching(/^PH: no person has checked this listing/)]);
    });
  });
});
