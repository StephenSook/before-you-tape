import { describe, expect, it } from "vitest";
import { ed, withCustomsUnchecked } from "../../tests/engine/helpers";
import { resolveDestination } from "./edition";
import { layerStatuses, rulesReadBy } from "./layers";

describe("layerStatuses", () => {
  it("reports four checked layers when all are fresh", () =>
    expect(layerStatuses(ed, resolveDestination(ed, "CA"), "2026-11-20").map((l) => `${l.id}:${l.state}`)).toEqual([
      "usps_export:checked", "destination:checked", "suspensions:checked", "customs:checked",
    ]));

  it("marks missing and stale layers", () => {
    expect(layerStatuses(ed, resolveDestination(ed, "ZZ"), "2026-11-20").find((l) => l.id === "destination")!.state).toBe("missing");
    expect(layerStatuses(ed, resolveDestination(ed, "CA"), "2026-12-20").find((l) => l.id === "suspensions")!.state).toBe("stale");
    expect(layerStatuses(withCustomsUnchecked(ed, "CA"), resolveDestination(withCustomsUnchecked(ed, "CA"), "CA"), "2026-11-20")
      .find((l) => l.id === "customs")!.state).toBe("missing");
  });

  it("marks the destination and customs stale after 60 days and the export rules after 120", () => {
    const at = (today: string) => Object.fromEntries(layerStatuses(ed, resolveDestination(ed, "CA"), today).map((l) => [l.id, l.state]));
    expect(at("2027-01-16")).toMatchObject({ destination: "checked", customs: "checked", usps_export: "checked" });
    expect(at("2027-01-17")).toMatchObject({ destination: "stale", customs: "stale", usps_export: "checked" });
    expect(at("2027-03-18")).toMatchObject({ usps_export: "stale" });
  });

  it("names each layer with its edition and check date", () => {
    const [usps, dest, susp, customs] = layerStatuses(ed, resolveDestination(ed, "PH"), "2026-11-20");
    expect(usps).toMatchObject({ label: "USPS export rules", checkedOn: "2026-11-17" });
    expect(usps?.edition).toContain("August 2026");
    expect(dest).toMatchObject({ edition: "IMM 2026-11-02", checkedOn: "2026-11-17" });
    expect(susp).toMatchObject({ label: "Service suspensions", edition: "Updated 2026-11-06", checkedOn: "2026-11-17" });
    expect(customs).toMatchObject({ label: "Philippines customs", checkedOn: "2026-11-17" });
  });

  it("says the listing was read by us and not yet checked by a person, until a person checks it", () => {
    const dest = (e: typeof ed) => layerStatuses(e, resolveDestination(e, "PH"), "2026-11-20")[1];
    expect(dest(ed)?.label).toBe("Philippines rules: read from the USPS page on 2026-11-17, not yet checked by a person");
    const checked = structuredClone(ed);
    checked.destinations.PH!.personReviewedOn = "2026-11-19";
    expect(dest(checked)?.label).toBe("Philippines rules: checked by a person on 2026-11-19");
    expect(dest(ed)?.label).not.toMatch(/person-reviewed|reviewed by a person/i);
  });

  it("says who read a country's rules, from one place, for the card and the picker alike", () => {
    expect(rulesReadBy(resolveDestination(ed, "PH"))).toEqual({ by: "usps_page", on: "2026-11-17" });
    const checked = structuredClone(ed);
    checked.destinations.PH!.personReviewedOn = "2026-11-19";
    expect(rulesReadBy(resolveDestination(checked, "PH"))).toEqual({ by: "person", on: "2026-11-19" });
    expect(rulesReadBy(resolveDestination(ed, "GH"))).toBeNull();
  });

  it("treats a country with no list as missing its rules layer", () => {
    const kn = { ...ed.destinations.CA!, code: "KN", name: "Saint Kitts and Nevis", noListFurnished: true, lines: [] };
    const e = { ...ed, destinations: { ...ed.destinations, KN: kn } };
    expect(layerStatuses(e, resolveDestination(e, "KN"), "2026-11-20").find((l) => l.id === "destination")!.state).toBe("missing");
  });

  it("never reads an impossible today or a check dated after today as fresh", () => {
    const states = (today: string) => layerStatuses(ed, resolveDestination(ed, "CA"), today).map((l) => l.state);
    expect(states("2026-99-99")).toEqual(["missing", "missing", "missing", "missing"]);
    expect(states("2026-02-30")).toEqual(["missing", "missing", "missing", "missing"]);
    expect(states("2026-11-10")).toEqual(["missing", "missing", "missing", "missing"]);
    expect(states("2026-11-17")).toEqual(["checked", "checked", "checked", "checked"]);
  });
});
