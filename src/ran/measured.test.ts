import { describe, expect, it } from "vitest";
import { readMeasured, STALE_DAYS } from "./measured";
import type { Measured } from "./summarize";

const good = (): Measured => ({
  measuredAt: "2026-11-21T12:00:00Z",
  source: "Firestore route records",
  window: { from: "2026-11-17", to: "2026-11-21" },
  boxes: { n: 40 },
  items: { n: 120 },
  typedByHand: { n: 80 },
  reads: { onDevice: { n: 25, p50Ms: 4500, p90Ms: 9000 }, inCloud: { fewerThan: 5 } },
  secondLooks: { fewerThan: 5 },
  fallbacks: { fewerThan: 5 },
});

describe("readMeasured", () => {
  it("accepts a file of the right shape measured within the last 14 days", () => {
    expect(STALE_DAYS).toBe(14);
    expect(readMeasured(good(), "2026-11-21")).toEqual({ ok: true, data: good() });
    expect(readMeasured(good(), "2026-12-05")).toMatchObject({ ok: true });
  });

  it("refuses a file older than 14 days as stale, so old numbers are never shown as current", () => {
    expect(readMeasured(good(), "2026-12-06")).toEqual({ ok: false, reason: "stale" });
  });

  it("refuses a file it cannot read: missing or extra fields, a wrong type, a future date", () => {
    const cases: unknown[] = [
      null, "x", {},
      { ...good(), boxes: undefined },
      { ...good(), extra: 1 },
      { ...good(), items: { n: "120" } },
      { ...good(), measuredAt: "not a date" },
      { ...good(), window: { from: "2026-11-17" } },
      { ...good(), reads: { onDevice: { n: 25, p50Ms: 9000, p90Ms: 4500 }, inCloud: { fewerThan: 5 } } },
    ];
    for (const c of cases) expect(readMeasured(c, "2026-11-21"), JSON.stringify(c)).toEqual({ ok: false, reason: "unreadable" });
    expect(readMeasured(good(), "2026-11-20")).toEqual({ ok: false, reason: "unreadable" });
  });

  // A count under 5 is only ever published as fewer than 5; a file that holds one is refused, not shown.
  it("refuses a file holding a count under 5", () => {
    expect(readMeasured({ ...good(), boxes: { n: 3 } }, "2026-11-21")).toEqual({ ok: false, reason: "unreadable" });
    expect(readMeasured({ ...good(), secondLooks: { n: 2, p50Ms: 1, p90Ms: 2 } }, "2026-11-21")).toEqual({ ok: false, reason: "unreadable" });
  });
});
