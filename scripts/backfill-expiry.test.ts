import { describe, expect, it } from "vitest";
import { planExpiry, type StoredDoc } from "./backfill-expiry";

const DAY = 86_400_000;
const at = (ms: number) => new Date(ms).toISOString();
const NOW = Date.parse("2026-11-21T12:00:00Z");

describe("planExpiry", () => {
  it("gives a box without an expiry its creation time plus 37 days, and its items and disputes the same", () => {
    const created = NOW - 5 * DAY;
    const boxes: StoredDoc[] = [{ path: "boxes/a", createTime: at(created) }];
    const items: StoredDoc[] = [{ path: "boxes/a/items/i1", createTime: at(created + 1000) }];
    const disputes: StoredDoc[] = [{ path: "boxes/a/disputes/i1", createTime: at(created + 2000) }];
    const plan = planExpiry(boxes, items, disputes, NOW);
    const expiry = at(created + 37 * DAY);
    expect(plan.writes).toEqual([
      { path: "boxes/a", expiresAt: expiry },
      { path: "boxes/a/items/i1", expiresAt: expiry },
      { path: "boxes/a/disputes/i1", expiresAt: expiry },
    ]);
    expect(plan.counts).toEqual({ boxes: { total: 1, missing: 1 }, items: { total: 1, missing: 1 }, disputes: { total: 1, missing: 1 }, boxesAlreadyPast: 0 });
  });

  it("leaves documents that have an expiry alone, and gives a new item of such a box that box's expiry", () => {
    const expiry = at(NOW + 30 * DAY);
    const plan = planExpiry(
      [{ path: "boxes/b", createTime: at(NOW - 7 * DAY), expiresAt: expiry }],
      [{ path: "boxes/b/items/i1", createTime: at(NOW), expiresAt: expiry }, { path: "boxes/b/items/i2", createTime: at(NOW) }],
      [], NOW);
    expect(plan.writes).toEqual([{ path: "boxes/b/items/i2", expiresAt: expiry }]);
    expect(plan.counts.boxes).toEqual({ total: 1, missing: 0 });
  });

  it("counts boxes whose expiry is already past, which TTL would delete at once", () => {
    const plan = planExpiry([{ path: "boxes/old", createTime: at(NOW - 40 * DAY) }], [], [], NOW);
    expect(plan.counts.boxesAlreadyPast).toBe(1);
  });

  it("gives an item whose box is gone the time now plus 37 days", () => {
    const plan = planExpiry([], [{ path: "boxes/gone/items/i1", createTime: at(NOW - DAY) }], [], NOW);
    expect(plan.writes).toEqual([{ path: "boxes/gone/items/i1", expiresAt: at(NOW + 37 * DAY) }]);
  });
});
