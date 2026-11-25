import { describe, expect, it } from "vitest";
import { buildRecord } from "./eval-rescore";

describe("buildRecord", () => {
  it("refuses a date that is not a real calendar day before reading any file", () => {
    for (const date of ["2026-11-31", "2026-02-29", "2026-13-01", "26-11-25"]) {
      expect(() => buildRecord(".", "no-such-run.json", [{ editionPath: "no-such-edition.json", date }])).toThrow(`${date} is not a calendar date`);
    }
  });
});
