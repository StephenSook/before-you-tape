// The published re-score (eval/runs/models-2026-11-21.rescored.public.json), checked against the published run it
// re-scores and against the rule editions it names, with no private file: the re-score of the run's own edition must
// give back every published level it could re-score, and the rest must be the rows whose second look it could not.
// scripts/eval-rescore.ts --check rebuilds the record from the private run and compares it byte for byte.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJson, parseEdition, sha256Hex } from "../engine/edition";
import { BRANDS, brandWord } from "../judge/brands.fixture";
import { rulesOnlyRun, typedCategoriesOf } from "./baselines";
import { buildEvalSet, type SetLabels, type SetManifest } from "./loadSet";
import type { NotRescored, RescoredRow, Verdict } from "./rescore";
import { readRescoreSummary, rescoreSummary, RESCORE_SOURCE, type RescoreRecord } from "./rescoreRecord";
import { withUpcoming } from "../../tests/engine/helpers";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8")) as unknown;
const recordText = readFileSync(RESCORE_SOURCE, "utf8");
const record = JSON.parse(recordText) as RescoreRecord;
type PublicPath = { level: string } | null;
const run = read("eval/runs/models-2026-11-21.public.json") as {
  runId: string; date: string; editionId: string;
  rows: { itemId: string; destination: string; device: PublicPath; cloud: PublicPath; shipped: { level: string; secondLook: boolean } }[];
};
const manifest = read("eval/set/manifest.json") as SetManifest;
const labels = read("eval/set/labels.json") as SetLabels;
const set = buildEvalSet(manifest, labels);
const truth = (r: { itemId: string; destination: string }) => set.items.find((i) => i.itemId === r.itemId)!.truth[r.destination]!.expected;
const first = record.blocks[0]!;
const last = record.blocks[record.blocks.length - 1]!;
const verdict = (v: Verdict | NotRescored | null): Verdict | null => (v && "level" in v ? v : null);
const reason = (v: Verdict | NotRescored | null) => (v && "notRescored" in v ? v.notRescored : null);
// The exact bytes of each edition copy the record may name. A copy edited under the same id fails here, whatever hash
// the record gives it.
const EDITION_SHA256: Record<string, string> = {
  "byt-3b5f5508968f": "1c8daae0c427ab4052191da8b67a31d8c96ea739350a79e2c5555bf3e5853ad4",
  "byt-f083f028e045": "f56f617351a0b4900291124e13e19311d718e1c24f82f55699144557b5b4bd3b",
  "byt-d098b14aa534": "92b2ac13d8d2caa4afeb91285fd9195abc812ba1155c703872df0926bacf8cbb",
};
// The reads whose saved label reached 160 characters (src/eval/rescore.ts): re-scored on the run's own edition, where
// the published level checks them, and not on any other.
const CUT: Record<"device" | "cloud" | "shipped", string[]> = { device: ["own-01"], cloud: [], shipped: ["own-20"] };
// How many rows of each block have a verdict on each path.
const VERDICTS = { first: { rulesOnly: 80, device: 80, cloud: 80, shipped: 54 }, later: { rulesOnly: 80, device: 78, cloud: 80, shipped: 52 } };

describe("the published re-score", () => {
  it("re-scores the published run, starting from the run's own edition and date", () => {
    expect(record.runId).toBe(run.runId);
    expect(record.runSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(record.blocks.length).toBeGreaterThanOrEqual(2);
    expect([first.editionId, first.date]).toEqual([run.editionId, run.date]);
    for (const b of record.blocks) expect(b.rows.map((r) => [r.itemId, r.destination])).toEqual(run.rows.map((r) => [r.itemId, r.destination]));
    expect(run.rows).toHaveLength(80);
  });

  it("gives back every published device and cloud level on the run's own edition", () => {
    for (const p of ["device", "cloud"] as const) {
      const back = first.rows.map((r) => verdict(r[p])?.level ?? null);
      expect(back).toEqual(run.rows.map((r) => r[p]?.level ?? null));
      expect(back.filter((l) => l !== null)).toHaveLength(80);
    }
  });

  it("gives back the 54 published shipped levels with no second look, and re-scores none of the 26 that had one", () => {
    const looked = run.rows.map((r) => r.shipped.secondLook);
    expect(looked.filter(Boolean)).toHaveLength(26);
    expect(first.rows.map((r) => reason(r.shipped))).toEqual(looked.map((l) => (l ? "second_look" : null)));
    const back = first.rows.flatMap((r, i) => (looked[i] ? [] : [[verdict(r.shipped)!.level, run.rows[i]!.shipped.level]]));
    expect(back).toHaveLength(54);
    for (const [got, published] of back) expect(got).toBe(published);
  });

  it("gives back the published agreement on the run's own edition: rules only 71, device 60, cloud 64 of 80", () => {
    const agree = (pick: (r: RescoredRow) => string | undefined) => first.rows.filter((r) => pick(r) === truth(r)).length;
    expect(agree((r) => r.rulesOnly)).toBe(71);
    expect(agree((r) => verdict(r.device)?.level)).toBe(60);
    expect(agree((r) => verdict(r.cloud)?.level)).toBe(64);
    // Always "Check this" needs no read and no rule: it agrees wherever the label is "Check this".
    expect(first.rows.filter((r) => truth(r) === "check")).toHaveLength(5);
    const published = read("eval/runs/rules_only-2026-11-21.json") as { rows: { shipped: { level: string } }[] };
    expect(first.rows.map((r) => r.rulesOnly)).toEqual(published.rows.map((r) => r.shipped.level));
  });

  it("has a verdict on every row of every block, but the published second-look rows and, after the first, the cut labels", () => {
    for (const [bi, b] of record.blocks.entries()) {
      for (const p of ["device", "cloud", "shipped"] as const) {
        const want = run.rows.map((r) => (p === "shipped" && r.shipped.secondLook ? "second_look"
          : bi > 0 && CUT[p].includes(r.itemId) ? "clipped_label" : null));
        expect(b.rows.map((r) => reason(r[p]))).toEqual(want);
        expect(b.rows.every((r) => r[p] !== null)).toBe(true);
      }
      const counts = {
        rulesOnly: b.rows.filter((r) => typeof r.rulesOnly === "string").length,
        device: b.rows.filter((r) => verdict(r.device)).length,
        cloud: b.rows.filter((r) => verdict(r.cloud)).length,
        shipped: b.rows.filter((r) => verdict(r.shipped)).length,
      };
      expect(counts).toEqual(bi === 0 ? VERDICTS.first : VERDICTS.later);
    }
  });

  it("names each edition by a committed copy whose bytes are pinned here and whose id is the hash of its content", async () => {
    const typed = typedCategoriesOf(labels, manifest);
    for (const b of record.blocks) {
      const bytes = readFileSync(b.editionFile);
      const sha = createHash("sha256").update(bytes).digest("hex");
      expect(sha).toBe(EDITION_SHA256[b.editionId]);
      expect(sha).toBe(b.editionSha256);
      const { editionId, ...body } = JSON.parse(bytes.toString("utf8")) as { editionId: string };
      expect(`byt-${(await sha256Hex(canonicalJson(body))).slice(0, 12)}`).toBe(editionId);
      const edition = parseEdition(JSON.parse(bytes.toString("utf8")));
      expect([edition.editionId, edition.revision]).toEqual([b.editionId, b.revision]);
      expect(b.editionFile).toBe(`eval/runs/editions/${b.editionId}.json`);
      const base = rulesOnlyRun(set, typed, edition, { date: b.date, machine: "test", editionId: b.editionId });
      expect(b.rows.map((r) => r.rulesOnly)).toEqual(base.rows.map((r) => r.shipped.level));
    }
  });

  it("changes no level between the run's edition and the last one, on any path; one rule hit is new on the device path", () => {
    const changed: string[] = [];
    const ruleOnly: string[] = [];
    // The run's edition noted a Canada suspension ahead, misread from an inactive USPS banner; the last one has none.
    const NOTE = "DEST-SUSPENSION-AHEAD:note";
    const notesDropped: string[] = [];
    for (const [i, a] of first.rows.entries()) {
      const b = last.rows[i]!;
      if (a.rulesOnly !== b.rulesOnly) changed.push(`rulesOnly ${a.itemId} ${a.destination}`);
      for (const p of ["device", "cloud", "shipped"] as const) {
        const x = verdict(a[p]);
        const y = verdict(b[p]);
        if (!x || !y) continue;
        if (x.level !== y.level) changed.push(`${p} ${a.itemId} ${a.destination}`);
        else {
          const added = y.rules.filter((id) => !x.rules.includes(id));
          const dropped = x.rules.filter((id) => !y.rules.includes(id) && id !== NOTE);
          if (x.rules.includes(NOTE) && !y.rules.includes(NOTE)) notesDropped.push(a.destination);
          expect(y.rules).not.toContain(NOTE);
          if (added.length || dropped.length || x.question !== y.question) ruleOnly.push(`${p} ${a.itemId} ${a.destination} +${added.join(",")} -${dropped.join(",")}`);
        }
      }
    }
    expect(changed).toEqual([]);
    expect(ruleOnly).toEqual(["i02", "i03", "i05"].flatMap((id) => ["CA", "PH"].map((d) => `device ${id} ${d} +USPS-INTL-LI-ONE-READ:check -`)));
    expect(notesDropped.length).toBeGreaterThan(0);
    expect(new Set(notesDropped)).toEqual(new Set(["CA"]));
  });

  it("publishes no read: only levels, rule ids, item ids and editions, and no brand name", () => {
    const pathKeys = ["level", "question", "rules"];
    for (const b of record.blocks) {
      expect(Object.keys(b).sort()).toEqual(["date", "editionFile", "editionId", "editionSha256", "revision", "rows"]);
      for (const r of b.rows) {
        expect(Object.keys(r).sort()).toEqual(["cloud", "destination", "device", "itemId", "rulesOnly", "shipped"]);
        for (const v of [r.device, r.cloud, r.shipped]) expect(Object.keys(v!).sort()).toEqual(verdict(v) ? pathKeys : ["notRescored"]);
      }
    }
    expect(Object.keys(record).sort()).toEqual(["blocks", "runId", "runSha256", "setId"]);
    expect(BRANDS.filter((b) => brandWord(b).test(recordText))).toEqual([]);
  });

  it("gives /ran the summary of its last block, dated, with any suspension announced after that date", () => {
    const summary = read("src/ran/rescore.json");
    const edition = parseEdition(read(last.editionFile));
    expect(summary).toEqual(rescoreSummary(record, edition));
    expect(last.date).toBe("2026-11-25");
    // The last block's edition announces no suspension, so /ran names none.
    expect(rescoreSummary(record, edition)).toMatchObject({ date: "2026-11-25", upcoming: [] });
    const ahead = withUpcoming(edition, "CA", "2026-11-29");
    expect(rescoreSummary(record, ahead).upcoming).toEqual([{ name: "Canada", from: "2026-11-29" }]);
    // A suspension already in force by the re-score's date is in its verdicts, so it is not announced as ahead.
    expect(rescoreSummary({ ...record, blocks: [first, { ...last, date: "2026-11-29" }] }, ahead).upcoming).toEqual([]);
    expect(readRescoreSummary(summary)).toEqual(summary);
    expect(rescoreSummary(record, edition)).toMatchObject({ shippedItems: 26, shippedRows: 52, shippedChanged: 0, secondLookItems: 13, clippedItems: 1 });
  });

  it("refuses to sum a block with a gap that is neither a second look nor a cut label, or a verdict the first block lacks", () => {
    const withLast = (rows: RescoredRow[]): RescoreRecord => ({ ...record, blocks: [first, { ...last, rows }] });
    const gap = last.rows.map((r, i) => (i === 0 ? { ...r, shipped: { notRescored: "no_verdict" as const } } : r));
    const edition = parseEdition(read(last.editionFile));
    expect(() => rescoreSummary(withLast(gap), edition)).toThrow(/not re-scored \(no_verdict\)/);
    const i = first.rows.findIndex((r) => reason(r.shipped) === "second_look");
    const extra = last.rows.map((r, k) => (k === i ? { ...r, shipped: { level: "check" as const, rules: [], question: null } } : r));
    expect(() => rescoreSummary(withLast(extra), edition)).toThrow(/no verdict on the run's own edition/);
  });
});

describe("readRescoreSummary", () => {
  const good = rescoreSummary(record, parseEdition(read(last.editionFile)));
  it("refuses a file that is missing, has other fields, or counts more changes than rows", () => {
    expect(readRescoreSummary({ ...good, upcoming: [{ name: "Canada", from: "2026-11-31" }] })).toBeNull();
    expect(readRescoreSummary({ ...good, upcoming: [{ name: "", from: "2026-11-29" }] })).toBeNull();
    expect(readRescoreSummary({ ...good, upcoming: "Canada" })).toBeNull();
    expect(readRescoreSummary({ ...good, date: "2026-11-31" })).toBeNull();
    expect(readRescoreSummary(undefined)).toBeNull();
    expect(readRescoreSummary({ ...good, extra: 1 })).toBeNull();
    expect(readRescoreSummary({ ...good, shippedRows: "54" })).toBeNull();
    expect(readRescoreSummary({ ...good, shippedChanged: 55 })).toBeNull();
    expect(readRescoreSummary(good)).toEqual(good);
  });
});
