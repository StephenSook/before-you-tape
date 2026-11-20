// Recorded on-device reads for /judge: a replay of the app's own read pipeline run on Chrome's built-in model
// (scripts/device-e2e.ts), shown only from a tracked record in evidence/device-e2e/. A record counts only
// when it passed, ran on a clean tree, names the Chrome and OS it ran on, and every read is one of the eval
// set's real photos read on the device with no call to the cloud model.

export interface RecordedRead { itemId: string; category: string | null; ms: number }
export interface RecordedReads { ranAt: string; sha: string; chromeVersion: string; os: string; reads: RecordedRead[] }

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

function qualify(r: unknown, evalIds: ReadonlySet<string>): RecordedReads | null {
  if (!isObj(r)) return null;
  if (r.passed !== true || r.dirty !== false || r.route !== "device_only" || r.cloudRequestsToAiLogic !== 0) return null;
  if (!text(r.ranAt) || !text(r.sha) || !text(r.chromeVersion) || !text(r.os) || !Array.isArray(r.reads) || r.reads.length === 0) return null;
  const reads: RecordedRead[] = [];
  for (const x of r.reads) {
    if (!isObj(x) || !text(x.itemId) || !evalIds.has(x.itemId) || x.source !== "on_device" || x.error !== null || typeof x.ms !== "number") return null;
    reads.push({ itemId: x.itemId, category: text(x.category) ? x.category : null, ms: x.ms });
  }
  return { ranAt: r.ranAt, sha: r.sha, chromeVersion: r.chromeVersion, os: r.os, reads };
}

// The newest record that counts, or null: /judge then shows no recorded block at all.
export function pickRecordedReads(records: readonly unknown[], evalIds: ReadonlySet<string>): RecordedReads | null {
  const ok = records.map((r) => qualify(r, evalIds)).filter((r): r is RecordedReads => r !== null);
  ok.sort((a, b) => (a.ranAt < b.ranAt ? 1 : a.ranAt > b.ranAt ? -1 : 0));
  return ok[0] ?? null;
}
