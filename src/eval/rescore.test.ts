import { describe, expect, it, vi } from "vitest";
import { ed } from "../../tests/engine/helpers";
import type { ImagePart, ItemModels, ModelPort } from "../ai/port";
import type { ItemRead } from "../shared/itemRead";
import { rulesOnlyRun } from "./baselines";
import { rescore, type SavedRun } from "./rescore";
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
      expect(r.device?.level).toBe(saved.device!.level);
      expect(r.cloud?.level).toBe(saved.cloud!.level);
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
    expect(lotionPh.device!.level).toBe("take_out");
    expect(lotionPh.device!.rules.length).toBeGreaterThan(0);
    expect(lotionPh.device!.rules.every((id) => /^[A-Z0-9-]+:(check|take_out|note)$/.test(id))).toBe(true);
    const base = rulesOnlyRun(set, typed, ed, { date: run.date, machine: "test", editionId: ed.editionId });
    expect(out.map((r) => r.rulesOnly)).toEqual(base.rows.map((r) => r.shipped.level));
  });

  it("keeps a path that did not run as not run, and refuses a shipped verdict with no saved read", async () => {
    const run = await savedRun();
    const noCloud: SavedRun = { ...run, rows: run.rows.map((r) => ({ ...r, cloud: null })) };
    expect(rescore(noCloud, set, typed, ed, run.date).every((r) => r.cloud === null)).toBe(true);
    const broken: SavedRun = { ...run, rows: run.rows.map((r) => (r.itemId === "own-18" ? { ...r, shipped: { ...r.shipped, read: undefined } } : r)) };
    expect(() => rescore(broken, set, typed, ed, run.date)).toThrow(/own-18: shipped verdict with no saved read/);
  });
});
