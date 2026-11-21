import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import committed from "../../rules/customs-authorities.json";
import { customsLinesFor, readCustomsAuthorities } from "./customsAuthorities";

const entries = readCustomsAuthorities(committed);

describe("rules/customs-authorities.json", () => {
  // Each line is quoted word for word from the authority's own page, as saved by scripts/capture-source.ts.
  it("quotes each line word for word from its saved source, read the day it says, from the page it names", () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      const saved = readFileSync(e.source, "utf8");
      expect(saved.split("\n")[0], e.code).toBe(`Source: ${e.url}`);
      expect(saved.split("\n")[1], e.code).toBe(`Read: ${e.checkedOn}`);
      expect(saved.split("\n")[2], e.code).toMatch(/^Main text SHA-256: [0-9a-f]{64}$/);
      for (const l of e.lines) expect(saved.split("\n").slice(4).join("\n"), `${e.code} ${l.label}`).toContain(l.quote);
    }
  });

  it("names Canada's mail and gift lines apart, and no country without a verified source", () => {
    expect(entries.map((e) => e.code)).toEqual(["CA"]);
    expect(entries[0]!.lines.map((l) => l.label)).toEqual(["Mailed items", "Gifts"]);
  });
});

describe("readCustomsAuthorities", () => {
  const good = () => JSON.parse(JSON.stringify(committed)) as Record<string, unknown>[];
  it("refuses a file of any other shape", () => {
    const bad: unknown[] = [
      {}, [{ ...good()[0], extra: 1 }], [{ ...good()[0], code: "Canada" }], [{ ...good()[0], checkedOn: "21 Nov" }],
      [{ ...good()[0], url: "http://www.cbsa-asfc.gc.ca/x" }], [{ ...good()[0], lines: [] }], [{ ...good()[0], lines: [{ label: "Gifts", quote: "" }] }],
      [{ ...good()[0], source: "../elsewhere.txt" }],
    ];
    for (const b of bad) expect(() => readCustomsAuthorities(b), JSON.stringify(b).slice(0, 80)).toThrow();
  });
});

describe("customsLinesFor", () => {
  it("gives a country's lines while they are fresh, and none once stale or for a country with none", () => {
    expect(customsLinesFor(entries, "CA", "2026-11-21", 60)?.authority).toBe("Canada Border Services Agency");
    expect(customsLinesFor(entries, "CA", "2027-01-20", 60)).not.toBeNull();
    expect(customsLinesFor(entries, "CA", "2027-01-21", 60)).toBeNull();
    expect(customsLinesFor(entries, "PH", "2026-11-21", 60)).toBeNull();
  });
});
