import { describe, expect, it } from "vitest";
import { ed } from "../tests/engine/helpers";
import { releaseGateProblems } from "./release-gate";

const TODAY = "2026-11-20";
const withReview = (on: string) => {
  const e = structuredClone(ed);
  for (const d of Object.values(e.destinations)) d.personReviewedOn = on;
  return e;
};

describe("releaseGateProblems", () => {
  it("fails while any bundled listing has not been checked by a person", () => {
    const problems = releaseGateProblems(ed, TODAY);
    expect(problems.some((p) => p.startsWith("CA:"))).toBe(true);
    expect(problems.some((p) => p.startsWith("PH:"))).toBe(true);
  });

  it("passes once a person has checked every listing", () => expect(releaseGateProblems(withReview("2026-11-19"), TODAY)).toEqual([]));

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

  it("fails an impossible today instead of passing", () =>
    expect(releaseGateProblems(withReview("2026-11-19"), "2026-13-40")).toEqual(["today is not a real date: 2026-13-40"]));

  it("fails an edition with no listings at all", () => {
    expect(releaseGateProblems({ ...ed, destinations: {} }, TODAY)).toEqual(["the edition has no destination listings"]);
  });
});
