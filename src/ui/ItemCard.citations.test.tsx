// Every "Rule:" link on a card names a rule that the rules data holds for the box's destination, in the edition the
// verdict was made with. A wrong citation is a claim anyone can follow and find false, so the set of citations a
// card may show is built here from rules/edition.json itself, never from the engine that made the verdict.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import raw from "../../rules/edition.json";
import { ed } from "../../tests/engine/helpers";
import vectors from "../../tests/vectors/box.json";
import defaults from "../../tests/vectors/defaults.json";
import type { BoxItem } from "../data/boxStore";
import { resolveDestination } from "../engine/edition";
import { evaluateBox } from "../engine/verdict";
import type { ItemRead } from "../shared/itemRead";
import { ItemCard } from "./ItemCard";

type Kind = "usps" | "imm_line" | "imm_listing" | "alerts";
interface EditionData {
  editionId: string;
  rules: Array<{ section: string; url: string }>;
  destinations: Record<string, { name: string; immUrl: string; lines: Array<{ section: string }> }>;
  suspensions: { url: string; codes: string[] };
  categoryTags: Record<string, string[]>;
  labelWords: Array<{ tag: string }>;
}
const data = raw as unknown as EditionData;
const SECTION_NAME: Record<string, string> = { prohibitions: "Prohibitions", restrictions: "Restrictions", observations: "Observations" };
const IMM_COUNTRY_INDEX = "https://pe.usps.com/text/imm/immctry.htm";

// The citations the rules data backs for one destination: each rule's own section and page, the country's IMM
// lines and listing (or USPS's country index, for a country the data has no listing for), and the service alerts.
function backed(code: string): Map<string, Kind> {
  const m = new Map<string, Kind>();
  for (const r of data.rules) m.set(`${r.section}|${r.url}`, "usps");
  m.set(`USPS international service alerts|${data.suspensions.url}`, "alerts");
  const d = data.destinations[code];
  if (d) {
    m.set(`IMM country listing|${d.immUrl}`, "imm_listing");
    for (const l of d.lines) m.set(`IMM ${d.name}, ${SECTION_NAME[l.section]}|${d.immUrl}`, "imm_line");
  } else {
    m.set(`IMM country listing|${IMM_COUNTRY_INDEX}`, "imm_listing");
  }
  return m;
}

const asItem = (i: Record<string, unknown>): BoxItem => ({
  ...structuredClone(defaults.itemDefaults), ...i, read: { ...defaults.baseRead, ...(i.read as object) } as ItemRead,
  readSource: "on_device", readMs: 0, secondLook: null, cropKey: null,
  customs: { description: "", lintOk: false, weightOz: null, valueUsd: null, countryOfOrigin: null, upc: null },
} as unknown as BoxItem);

// One item per category carrying every label word and flag, and lithium numbers past the limits, so the verdicts
// cite as many rules and country lines as the edition has.
const everything = (code: string): BoxItem[] => {
  const words = ["label_text", ...new Set(data.labelWords.map((w) => w.tag))];
  return Object.keys(data.categoryTags).map((category) => asItem({
    itemId: `${code}-${category}`, labelTags: words,
    read: { itemName: category, category, labelText: "", volts: 3.7, milliampHours: 60000, wattHours: 222, lithiumGrams: 3,
      batteryWords: true, liquid: true, pressurized: true, alcoholOnLabel: true, flammableOnLabel: true, glassContainer: true,
      powder: true, retailBox: "open_or_none", evidence: "label_read" },
  }));
};

const boxes: Array<{ code: string; today: string; items: BoxItem[] }> = [
  ...(vectors as Array<{ code: string; today: string; items: Array<Record<string, unknown>> }>).map((v) => ({ code: v.code, today: v.today, items: v.items.map(asItem) })),
  ...Object.keys(data.destinations).map((code) => ({ code, today: "2026-11-20", items: everything(code) })),
];

afterEach(cleanup);

describe("the rule links on a card", () => {
  it("are only rules the edition holds for the box's destination, from the edition the verdict used", () => {
    const seen = new Map<Kind, Set<string>>();
    let links = 0;
    for (const b of boxes) {
      const result = evaluateBox(b.items, ed, resolveDestination(ed, b.code), b.today);
      expect(result.editionId).toBe(data.editionId);
      const allowed = backed(b.code);
      for (const item of b.items) {
        const verdict = result.items[item.itemId];
        if (!verdict) throw new Error(`no verdict for ${item.itemId}`);
        const { container, unmount } = render(<ItemCard item={item} verdict={verdict} crop={null} />);
        for (const a of container.querySelectorAll<HTMLAnchorElement>('[data-testid="rule-list"] a')) {
          const section = (a.textContent ?? "").replace(/^Rule: /, "");
          const key = `${section}|${a.getAttribute("href")}`;
          const kind = allowed.get(key);
          expect(kind, `${b.code} ${item.itemId}: "${a.textContent}" -> ${a.getAttribute("href")}`).toBeDefined();
          if (kind) (seen.get(kind) ?? seen.set(kind, new Set()).get(kind)!).add(`${b.code}|${key}`);
          links++;
        }
        unmount();
      }
    }
    // Not vacuous: every kind of citation was shown and checked, for both reviewed countries.
    expect(links).toBeGreaterThan(100);
    for (const kind of ["usps", "imm_line", "imm_listing", "alerts"] as const) expect(seen.get(kind)?.size ?? 0, kind).toBeGreaterThan(0);
    for (const code of Object.keys(data.destinations)) {
      expect([...(seen.get("imm_line") ?? [])].some((k) => k.startsWith(`${code}|`)), code).toBe(true);
    }
    // It renders every card of every test box and country, so a busy machine needs more than 5 s.
  }, 30_000);

  it("never accept another country's lines, or a page the section is not on", () => {
    const [first, second] = Object.keys(data.destinations);
    const other = data.destinations[second!]!;
    const line = `IMM ${other.name}, ${SECTION_NAME[other.lines[0]!.section]}`;
    expect(backed(second!).has(`${line}|${other.immUrl}`)).toBe(true);
    expect(backed(first!).has(`${line}|${other.immUrl}`)).toBe(false);
    expect(backed(first!).has(`${data.rules[0]!.section}|${data.rules[1]!.url}`)).toBe(data.rules[0]!.url === data.rules[1]!.url);
  });
});
