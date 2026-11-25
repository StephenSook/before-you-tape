import { describe, expect, it, vi } from "vitest";
import { ed } from "../../tests/engine/helpers";
import type { ImagePart, ItemModels, ModelPort } from "../ai/port";
import type { ItemRead } from "../shared/itemRead";
import { rulesOnlyRun } from "./baselines";
import { rescore, type RescoredRow, type SavedRun } from "./rescore";
import { evalRows } from "./runner";
import type { EvalSet } from "./types";

const lotion: ItemRead = {
  itemName: "Body lotion", category: "lotion_cream", labelText: "BODY LOTION 8 FL OZ", volts: 0, milliampHours: 0, wattHours: 0,
  lithiumGrams: 0, batteryWords: false, liquid: true, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false,
  glassContainer: false, powder: false, retailBox: "cannot_tell", evidence: "label_read",
};
// 3.7 V x 2500 mAh is 9.25 Wh, more than 3 percent from the printed 9.62: a Wh mismatch, which gets a second look.
const phone: ItemRead = { ...lotion, itemName: "Phone", category: "phone", labelText: "LI-ION 3.7V 2500mAh 9.62Wh", liquid: false,
  volts: 3.7, milliampHours: 2500, wattHours: 9.62, batteryWords: true };
const phoneCloud: ItemRead = { ...phone, labelText: "LI-ION 3.7V 2600mAh 9.62Wh", milliampHours: 2600 };

const port = (byPhoto: Record<string, ItemRead>, source: "on_device" | "in_cloud"): ModelPort => ({
  generate: vi.fn(async (_prompt: string, image?: ImagePart) => ({ text: JSON.stringify(byPhoto[image?.base64 ?? ""] ?? lotion), source })),
});

const set: EvalSet = {
  setId: "set-1", manifestSha256: "m", protocolSha256: "p", destinations: ["CA", "PH"],
  items: ["own-18", "own-01"].map((itemId) => ({
    itemId, photo: `/eval/items/${itemId}.jpg`, photoSha256: "s", hazard: true, printed: null,
    truth: { CA: { expected: "ok", section: "x" }, PH: { expected: "take_out", section: "x" } },
    provenance: { sourcePage: "", author: "", license: "", licenseUrl: "", changes: "" },
  })),
};
const typed = { "own-18": "lotion_cream", "own-01": "phone" } as const;
const images: Record<string, ImagePart> = { "own-18": { mimeType: "image/jpeg", base64: "lotion" }, "own-01": { mimeType: "image/jpeg", base64: "phone" } };
let t = 0;
const now = () => (t += 100);
const v = (x: RescoredRow["device"]) => (x && "level" in x ? x : null);
const why = (x: RescoredRow["device"]) => (x && "notRescored" in x ? x.notRescored : null);
// Each row's item, destination and, per path, why it was not re-scored (null when it was).
const reasons = (out: RescoredRow[]) => out.map((r) => [r.itemId, r.destination, why(r.device), why(r.cloud), why(r.shipped)]);
const failing = (): ModelPort => ({ generate: vi.fn(async () => { throw new Error("Failed to fetch"); }) });

async function savedRun(): Promise<SavedRun> {
  const models: ItemModels = {
    device: port({ lotion, phone }, "on_device"), hybrid: port({ lotion, phone }, "on_device"), cloud: port({ lotion, phone: phoneCloud }, "in_cloud"),
  };
  const out = await evalRows({ set, edition: ed, date: "2026-11-21", models, images, now });
  expect(out.failures).toEqual([]);
  return { runId: "run-1", date: "2026-11-21", editionId: ed.editionId, rows: out.rows as SavedRun["rows"] };
}

describe("rescore", () => {
  it("judges each saved read again exactly as the runner judged it, on the run's own edition and date", async () => {
    const run = await savedRun();
    const out = rescore(run, set, typed, ed, run.date);
    expect(out.map((r) => [r.itemId, r.destination])).toEqual(run.rows.map((r) => [r.itemId, r.destination]));
    for (const [i, r] of out.entries()) {
      const saved = run.rows[i]!;
      expect(v(r.device)?.level).toBe(saved.device!.level);
      expect(v(r.cloud)?.level).toBe(saved.cloud!.level);
    }
    // The lotion got no second look: its shipped read is the read judged, so it re-scores to the same level.
    const lotionRows = out.filter((r) => r.itemId === "own-18");
    expect(lotionRows.map((r) => ("level" in r.shipped ? r.shipped.level : null)))
      .toEqual(run.rows.filter((r) => r.itemId === "own-18").map((r) => r.shipped.level));
  });

  it("does not re-score a shipped verdict that rests on a second look, whose compared reads the run did not save", async () => {
    const run = await savedRun();
    expect(run.rows.find((r) => r.itemId === "own-01")!.shipped.secondLook).toBe(true);
    const out = rescore(run, set, typed, ed, run.date);
    for (const r of out.filter((x) => x.itemId === "own-01")) expect(r.shipped).toEqual({ notRescored: "second_look" });
  });

  it("names the rules each verdict rests on, and gives the rules-only verdict of the same edition beside it", async () => {
    const run = await savedRun();
    const out = rescore(run, set, typed, ed, run.date);
    const lotionPh = out.find((r) => r.itemId === "own-18" && r.destination === "PH")!;
    const device = v(lotionPh.device)!;
    expect(device.level).toBe("take_out");
    expect(device.rules.length).toBeGreaterThan(0);
    expect(device.rules.every((id) => /^[A-Z0-9-]+:(check|take_out|note)$/.test(id))).toBe(true);
    const base = rulesOnlyRun(set, typed, ed, { date: run.date, machine: "test", editionId: ed.editionId });
    expect(out.map((r) => r.rulesOnly)).toEqual(base.rows.map((r) => r.shipped.level));
  });

  it("does not re-score a read whose saved label reached 160 characters, unless asked to on the run's own edition", async () => {
    const run = await savedRun();
    // The runner judged label words from the whole label; the saved read keeps 160 characters, so a word past them
    // could count live and not here.
    const long = "BODY LOTION ".repeat(20).slice(0, 160);
    const cut: SavedRun = { ...run, rows: run.rows.map((r) => (r.itemId === "own-18"
      ? { ...r, device: { ...r.device!, read: { ...r.device!.read!, labelText: long } }, shipped: { ...r.shipped, read: { ...r.shipped.read!, labelText: long } } }
      : r)) };
    // Exactly the two cut reads are left out, on both rows of their item; everything else is re-scored.
    expect(reasons(rescore(cut, set, typed, ed, run.date))).toEqual([
      ["own-18", "CA", "clipped_label", null, "clipped_label"], ["own-18", "PH", "clipped_label", null, "clipped_label"],
      ["own-01", "CA", null, null, "second_look"], ["own-01", "PH", null, null, "second_look"],
    ]);
    const scored = rescore(cut, set, typed, ed, run.date, { scoreClipped: true });
    expect(reasons(scored)).toEqual([
      ["own-18", "CA", null, null, null], ["own-18", "PH", null, null, null],
      ["own-01", "CA", null, null, "second_look"], ["own-01", "PH", null, null, "second_look"],
    ]);
    expect(scored.filter((r) => r.itemId === "own-18").every((r) => v(r.device) && v(r.shipped))).toBe(true);
    // 159 characters were saved whole.
    const whole: SavedRun = { ...run, rows: run.rows.map((r) => (r.itemId === "own-18"
      ? { ...r, device: { ...r.device!, read: { ...r.device!.read!, labelText: long.slice(0, 159) } } } : r)) };
    expect(reasons(rescore(whole, set, typed, ed, run.date)).filter((r) => r[0] === "own-18")).toEqual([
      ["own-18", "CA", null, null, null], ["own-18", "PH", null, null, null],
    ]);
  });

  it("gives a shipped read that failed no verdict, never a second look, and keeps its failed paths as not run", async () => {
    const models: ItemModels = { device: failing(), hybrid: failing(), cloud: failing() };
    const out = await evalRows({ set, edition: ed, date: "2026-11-21", models, images, now });
    expect(out.rows[0]!.shipped).toEqual({ level: "check", source: "failed", secondLook: false });
    const run: SavedRun = { runId: "run-2", date: "2026-11-21", editionId: ed.editionId, rows: out.rows as SavedRun["rows"] };
    for (const r of rescore(run, set, typed, ed, run.date)) {
      expect(r.shipped).toEqual({ notRescored: "no_verdict" });
      expect([r.device, r.cloud]).toEqual([null, null]);
    }
    // A failed route is no verdict even if a second look were marked on it.
    const marked: SavedRun = { ...run, rows: run.rows.map((r) => ({ ...r, shipped: { ...r.shipped, secondLook: true } })) };
    expect(rescore(marked, set, typed, ed, run.date).map((r) => r.shipped)).toEqual(run.rows.map(() => ({ notRescored: "no_verdict" })));
  });

  it("keeps a path that did not run as not run, and refuses a shipped verdict with no saved read", async () => {
    const run = await savedRun();
    const noCloud: SavedRun = { ...run, rows: run.rows.map((r) => ({ ...r, cloud: null })) };
    expect(rescore(noCloud, set, typed, ed, run.date).every((r) => r.cloud === null)).toBe(true);
    const broken: SavedRun = { ...run, rows: run.rows.map((r) => (r.itemId === "own-18" ? { ...r, shipped: { ...r.shipped, read: undefined } } : r)) };
    expect(() => rescore(broken, set, typed, ed, run.date)).toThrow(/own-18: shipped verdict with no saved read/);
  });
});
