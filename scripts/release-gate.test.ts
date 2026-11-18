import { describe, expect, it } from "vitest";
import { ed } from "../tests/engine/helpers";
import { releaseGateProblems } from "./release-gate";

describe("releaseGateProblems", () => {
  it("fails while any bundled listing has not been checked by a person", () => {
    const problems = releaseGateProblems(ed);
    expect(problems.some((p) => p.startsWith("CA:"))).toBe(true);
    expect(problems.some((p) => p.startsWith("PH:"))).toBe(true);
  });

  it("passes once a person has checked every listing", () => {
    const checked = structuredClone(ed);
    for (const d of Object.values(checked.destinations)) d.personReviewedOn = "2026-11-19";
    expect(releaseGateProblems(checked)).toEqual([]);
  });

  it("fails an edition with no listings at all", () => {
    expect(releaseGateProblems({ ...ed, destinations: {} })).toEqual(["the edition has no destination listings"]);
  });
});
