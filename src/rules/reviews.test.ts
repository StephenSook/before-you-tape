import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import committed from "../../rules/reviews.json";
import { canonicalJson } from "../engine/edition";
import { ed } from "../../tests/engine/helpers";
import { approvalOf, readReviews } from "./reviews";

const good = {
  note: "n",
  listings: {
    CA: {
      linesSha256: "a".repeat(64), aiCheckedOn: "2026-11-21", aiCheck: "Two AI reviews checked each line.",
      personApprovedOn: "2026-11-21", personApprovedBy: "the project owner", personApproval: "Approved as a whole.", restatedOn: "2026-11-25",
    },
  },
};

describe("the review record of the destination rule lines", () => {
  it("reads a listing's AI check and the person's approval", () => {
    expect(approvalOf(readReviews(good), "CA")).toMatchObject({ aiCheckedOn: "2026-11-21", personApprovedOn: "2026-11-21", personApprovedBy: "the project owner" });
    expect(approvalOf(readReviews(good), "PH")).toBeNull();
  });

  it("refuses a record with a field missing, extra or malformed", () => {
    const listing = good.listings.CA;
    const without: Record<string, unknown> = { ...listing };
    delete without.restatedOn;
    expect(() => readReviews({ ...good, listings: { CA: without } })).toThrow(/exactly/);
    expect(() => readReviews({ ...good, listings: { CA: { ...listing, personReviewedOn: "2026-11-21" } } })).toThrow(/exactly/);
    expect(() => readReviews({ ...good, listings: { CA: { ...listing, personApprovedOn: "soon" } } })).toThrow(/date/);
    expect(() => readReviews({ ...good, listings: { CA: { ...listing, linesSha256: "abc" } } })).toThrow(/SHA-256/);
    expect(() => readReviews({ ...good, listings: { CA: { ...listing, restatedOn: "2026-11-20" } } })).toThrow(/before/);
  });

  // An approval covers the lines it was given. If a line changes, this fails until the lines are approved again.
  it("binds each committed approval to the lines the bundled edition carries now", () => {
    const reviews = readReviews(committed);
    for (const code of Object.keys(ed.destinations)) {
      const a = approvalOf(reviews, code);
      expect(a, code).not.toBeNull();
      expect(createHash("sha256").update(canonicalJson(ed.destinations[code]!.lines)).digest("hex"), code).toBe(a!.linesSha256);
      expect(a!.personApprovedBy).toBe("the project owner");
      expect(a!.personApproval).toMatch(/as a whole, not line by line/);
    }
  });
});
