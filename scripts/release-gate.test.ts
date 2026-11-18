import { describe, expect, it } from "vitest";
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
});
