import { describe, expect, it } from "vitest";
import { ed, withSuspended, withUpcoming } from "../../tests/engine/helpers";
import { destinationBadges } from "./destinationBadges";

describe("destinationBadges", () => {
  it("names a suspension the post office has announced, then says it has started, as the rules apply it", () => {
    const e = withUpcoming(ed, "CA", "2026-11-29");
    expect(destinationBadges(e, ["CA", "PH"], "2026-11-21")).toEqual({ CA: "USPS stops Nov 29" });
    expect(destinationBadges(e, ["CA", "PH"], "2026-11-29")).toEqual({ CA: "USPS suspended" });
  });

  it("marks a country already suspended", () => {
    expect(destinationBadges(withSuspended(ed, ["PH"]), ["CA", "PH"], "2026-11-21")).toMatchObject({ PH: "USPS suspended" });
  });
});
