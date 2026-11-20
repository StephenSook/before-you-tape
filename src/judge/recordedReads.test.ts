import { describe, expect, it } from "vitest";
import manifest from "../../eval/set/manifest.json";
import { pickRecordedReads } from "./recordedReads";

const ids = new Set(manifest.items.map((i) => i.itemId));
const read = (itemId: string, over: Record<string, unknown> = {}) =>
  ({ itemId, file: `${itemId}.jpg`, source: "on_device", ms: 2900, recoveredFrom: null, error: null, category: "lotion_cream", ...over });
const record = (over: Record<string, unknown> = {}) => ({
  ranAt: "2026-11-21T10:00:00.000Z", sha: "a".repeat(40), dirty: false, route: "device_only", gate: "available",
  chromeVersion: "157.0.8103.80", os: "macOS 27.0", photos: "eval/set photos own-18, own-01, own-25",
  reads: [read("own-18"), read("own-01"), read("own-25")], cloudRequestsToAiLogic: 0, passed: true, ...over,
});

describe("pickRecordedReads", () => {
  it("picks the newest passing record of real eval photos read on the device, with its Chrome and OS", () => {
    const older = record({ ranAt: "2026-11-20T10:00:00.000Z" });
    const newer = record({ ranAt: "2026-11-22T10:00:00.000Z" });
    expect(pickRecordedReads([older, newer], ids)?.ranAt).toBe("2026-11-22T10:00:00.000Z");
  });

  it("shows nothing for a record that is missing a version, failed, ran on a changed tree, or read anything off the device", () => {
    for (const bad of [
      record({ chromeVersion: undefined }), record({ os: "" }), record({ passed: false }), record({ dirty: true }),
      record({ cloudRequestsToAiLogic: 1 }), record({ reads: [] }), record({ route: "hybrid" }),
      record({ reads: [read("own-18", { source: "in_cloud" })] }), record({ reads: [read("own-18", { error: "device_failed: x" })] }),
      record({ reads: [read("not-in-the-set")] }), record({ reads: [{ ...read("own-18"), itemId: undefined }] }),
    ]) {
      expect(pickRecordedReads([bad], ids), JSON.stringify(bad).slice(0, 120)).toBeNull();
    }
  });

  it("keeps the machine a record names, and leaves it out when the record has none", () => {
    const machine = { model: "Mac17,9", chip: "Apple M5 Pro", memoryGb: 48 };
    expect(pickRecordedReads([record({ machine })], ids)?.machine).toEqual(machine);
    expect(pickRecordedReads([record()], ids)?.machine).toBeUndefined();
    expect(pickRecordedReads([record({ machine: { chip: 5 } })], ids)?.machine).toBeUndefined();
  });

  it("shows nothing for the first on-device record, which read generated labels and recorded no versions", async () => {
    const { default: first } = await import("../../evidence/device-e2e/2026-11-18T08-58-25-728Z.json");
    expect(pickRecordedReads([first], ids)).toBeNull();
    expect(pickRecordedReads([], ids)).toBeNull();
  });
});
