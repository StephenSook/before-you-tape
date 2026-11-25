// The published re-score (eval/runs/models-2026-11-21.rescored.public.json), checked against the published run it
// re-scores and against the rule editions it names, with no private file: the re-score of the run's own edition must
// give back every published level it could re-score, and the rest must be the rows whose second look it could not.
// scripts/eval-rescore.ts --check rebuilds the record from the private run and compares it byte for byte.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseEdition } from "../engine/edition";
import { BRANDS, brandWord } from "../judge/brands.fixture";
import { rulesOnlyRun, typedCategoriesOf } from "./baselines";
import { buildEvalSet, type SetLabels, type SetManifest } from "./loadSet";
import type { RescoredRow, Verdict } from "./rescore";
import { readRescoreSummary, rescoreSummary, RESCORE_SOURCE, type RescoreRecord } from "./rescoreRecord";

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
const verdict = (v: RescoredRow["shipped"]): Verdict | null => ("level" in v ? v : null);

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
      const back = first.rows.map((r) => r[p]?.level ?? null);
      expect(back).toEqual(run.rows.map((r) => r[p]?.level ?? null));
      expect(back.filter((l) => l !== null)).toHaveLength(80);
    }
  });

  it("gives back the 54 published shipped levels with no second look, and re-scores none of the 26 that had one", () => {
    const looked = run.rows.map((r) => r.shipped.secondLook);
    expect(looked.filter(Boolean)).toHaveLength(26);
    for (const b of record.blocks) {
      expect(b.rows.map((r) => "notRescored" in r.shipped)).toEqual(looked);
      for (const r of b.rows.filter((x) => "notRescored" in x.shipped)) expect(r.shipped).toEqual({ notRescored: "second_look" });
    }
    const back = first.rows.flatMap((r, i) => (looked[i] ? [] : [[verdict(r.shipped)!.level, run.rows[i]!.shipped.level]]));
    expect(back).toHaveLength(54);
    for (const [got, published] of back) expect(got).toBe(published);
  });

  it("gives back the published agreement on the run's own edition: rules only 71, device 60, cloud 64 of 80", () => {
    const agree = (pick: (r: RescoredRow) => string | undefined) => first.rows.filter((r) => pick(r) === truth(r)).length;
    expect(agree((r) => r.rulesOnly)).toBe(71);
    expect(agree((r) => r.device?.level)).toBe(60);
    expect(agree((r) => r.cloud?.level)).toBe(64);
    // Always "Check this" needs no read and no rule: it agrees wherever the label is "Check this".
    expect(first.rows.filter((r) => truth(r) === "check")).toHaveLength(5);
    const published = read("eval/runs/rules_only-2026-11-21.json") as { rows: { shipped: { level: string } }[] };
    expect(first.rows.map((r) => r.rulesOnly)).toEqual(published.rows.map((r) => r.shipped.level));
  });

  it("names each edition by a committed copy whose hash and id match, and gives that edition's rules-only verdicts", () => {
    const typed = typedCategoriesOf(labels, manifest);
    for (const b of record.blocks) {
      const bytes = readFileSync(b.editionFile);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(b.editionSha256);
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
    for (const [i, a] of first.rows.entries()) {
      const b = last.rows[i]!;
      if (a.rulesOnly !== b.rulesOnly) changed.push(`rulesOnly ${a.itemId} ${a.destination}`);
      for (const p of ["device", "cloud", "shipped"] as const) {
        const x = p === "shipped" ? verdict(a.shipped) : a[p];
        const y = p === "shipped" ? verdict(b.shipped) : b[p];
        if (!x || !y) continue;
        if (x.level !== y.level) changed.push(`${p} ${a.itemId} ${a.destination}`);
        else {
          const added = y.rules.filter((id) => !x.rules.includes(id));
          const dropped = x.rules.filter((id) => !y.rules.includes(id));
          if (added.length || dropped.length || x.question !== y.question) ruleOnly.push(`${p} ${a.itemId} ${a.destination} +${added.join(",")} -${dropped.join(",")}`);
        }
      }
    }
    expect(changed).toEqual([]);
    expect(ruleOnly).toEqual(["i02", "i03", "i05"].flatMap((id) => ["CA", "PH"].map((d) => `device ${id} ${d} +USPS-INTL-LI-ONE-READ:check -`)));
  });

  it("publishes no read: only levels, rule ids, item ids and editions, and no brand name", () => {
    const pathKeys = ["level", "question", "rules"];
    for (const b of record.blocks) {
      expect(Object.keys(b).sort()).toEqual(["date", "editionFile", "editionId", "editionSha256", "revision", "rows"]);
      for (const r of b.rows) {
        expect(Object.keys(r).sort()).toEqual(["cloud", "destination", "device", "itemId", "rulesOnly", "shipped"]);
        for (const v of [r.device, r.cloud, verdict(r.shipped)]) if (v) expect(Object.keys(v).sort()).toEqual(pathKeys);
      }
    }
    expect(Object.keys(record).sort()).toEqual(["blocks", "runId", "runSha256", "setId"]);
    expect(BRANDS.filter((b) => brandWord(b).test(recordText))).toEqual([]);
  });

  it("gives /ran the summary of its last block", () => {
    const summary = read("src/ran/rescore.json");
    expect(summary).toEqual(rescoreSummary(record));
    expect(readRescoreSummary(summary)).toEqual(summary);
    expect(rescoreSummary(record)).toMatchObject({ shippedItems: 27, shippedRows: 54, shippedChanged: 0, notRescoredItems: 13 });
  });
});

describe("readRescoreSummary", () => {
  const good = rescoreSummary(record);
  it("refuses a file that is missing, has other fields, or counts more changes than rows", () => {
    expect(readRescoreSummary(undefined)).toBeNull();
    expect(readRescoreSummary({ ...good, extra: 1 })).toBeNull();
    expect(readRescoreSummary({ ...good, shippedRows: "54" })).toBeNull();
    expect(readRescoreSummary({ ...good, shippedChanged: 55 })).toBeNull();
    expect(readRescoreSummary(good)).toEqual(good);
  });
});
