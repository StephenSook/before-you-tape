import { describe, expect, it } from "vitest";
import { summarizeRoutes, type RouteRow } from "./summarize";

const row = (readSource: string, readMs: number, extra: Partial<RouteRow> = {}): RouteRow =>
  ({ readSource, readMs, createTime: "2026-11-20T10:00:00Z", ...extra });
const many = (n: number, f: (i: number) => RouteRow) => Array.from({ length: n }, (_, i) => f(i));

describe("summarizeRoutes", () => {
  it("counts reads per route, with the median and 90th percentile time of each model route", () => {
    const rows = [
      ...many(10, (i) => row("on_device", (i + 1) * 1000)),
      ...many(6, (i) => row("in_cloud", 1000 + i * 100)),
    ];
    const s = summarizeRoutes(rows, 4, "2026-11-21T12:00:00Z", "test source");
    expect(s.reads.onDevice).toEqual({ n: 10, p50Ms: 5000, p90Ms: 9000 });
    expect(s.reads.inCloud).toEqual({ n: 6, p50Ms: 1200, p90Ms: 1500 });
    expect(s.measuredAt).toBe("2026-11-21T12:00:00Z");
    expect(s.source).toBe("test source");
  });

  // So no number can point at one visitor: a total under 5 is published only as "fewer than 5", with no time.
  it("publishes any total under 5 as fewer than 5, and no time for it", () => {
    const s = summarizeRoutes([row("on_device", 1000), row("on_device", 2000), row("in_cloud", 900)], 2, "2026-11-21T12:00:00Z", "s");
    expect(s.reads.onDevice).toEqual({ fewerThan: 5 });
    expect(s.reads.inCloud).toEqual({ fewerThan: 5 });
    expect(s.boxes).toEqual({ fewerThan: 5 });
    expect(s.items).toEqual({ fewerThan: 5 });
  });

  it("counts typed items apart from model reads, and second looks and fallbacks on their own", () => {
    const rows = [
      ...many(7, () => row("manual", 0)),
      ...many(5, (i) => row("on_device", 2000, { secondLookMs: 1000 + i * 100 })),
      ...many(5, () => row("in_cloud", 1500, { fallback: { after: "503", route: "cloud_only" } })),
      ...many(5, () => row("cloud_unreported", 1400)),
    ];
    const s = summarizeRoutes(rows, 6, "2026-11-21T12:00:00Z", "s");
    expect(s.typedByHand).toEqual({ n: 7 });
    expect(s.reads.onDevice).toMatchObject({ n: 5 });
    expect(s.reads.inCloud).toMatchObject({ n: 10 });
    expect(s.secondLooks).toEqual({ n: 5, p50Ms: 1200, p90Ms: 1400 });
    expect(s.fallbacks).toEqual({ n: 5 });
    expect(s.items).toEqual({ n: 22 });
    expect(s.boxes).toEqual({ n: 6 });
  });

  it("gives the window of the reads, and none when there are no reads", () => {
    const s = summarizeRoutes([row("on_device", 1000, { createTime: "2026-11-19T08:00:00Z" }), row("on_device", 1000, { createTime: "2026-11-21T09:00:00Z" })], 1, "2026-11-21T12:00:00Z", "s");
    expect(s.window).toEqual({ from: "2026-11-19", to: "2026-11-21" });
    expect(summarizeRoutes([], 0, "2026-11-21T12:00:00Z", "s").window).toBeNull();
  });

  it("holds only counts and times, never an id, a category or a name", () => {
    const s = summarizeRoutes(many(6, (i) => row("on_device", 1000, { itemId: `secret-${i}`, category: "phone" } as Partial<RouteRow>)), 6, "2026-11-21T12:00:00Z", "s");
    expect(JSON.stringify(s)).not.toMatch(/secret-|phone/);
  });
});
