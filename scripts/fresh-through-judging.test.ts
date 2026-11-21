import { describe, expect, it } from "vitest";
import edition from "../rules/edition.json";
import { parseEdition } from "../src/engine/edition";
import { ed } from "../tests/engine/helpers";
import { freshness, REREAD_FROM, staleBeforeJudgingEnds } from "./fresh-through-judging";

const withSuspensionsOn = (on: string) => {
  const e = structuredClone(ed);
  e.suspensions.checkedOn = on;
  return e;
};

describe("rules fresh through judging", () => {
  it("names each layer that would read stale before the last judging day, with the day it turns", () => {
    const problems = staleBeforeJudgingEnds(withSuspensionsOn("2026-11-20"));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((p) => p.layer === "suspensions" && p.staleFrom === "2026-12-12")).toBe(true);
    expect(staleBeforeJudgingEnds(withSuspensionsOn("2026-11-28"))).toEqual([]);
  });

  it("warns before the re-read window and fails from its first day", () => {
    const e = withSuspensionsOn("2026-11-20");
    expect(REREAD_FROM).toBe("2026-11-27");
    expect(freshness(e, "2026-11-26").exit).toBe(0);
    expect(freshness(e, "2026-11-26").lines.join("\n")).toMatch(/warning.*suspensions.*2026-12-12/s);
    expect(freshness(e, "2026-11-27").exit).toBe(1);
    expect(freshness(withSuspensionsOn("2026-11-28"), "2026-11-28")).toEqual({ exit: 0, lines: ["rules fresh through 2026-12-16: every layer reads checked"] });
  });

  it("reads the bundled edition without throwing", () => {
    expect(() => freshness(parseEdition(edition), "2026-11-21")).not.toThrow();
  });
});
