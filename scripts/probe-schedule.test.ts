import { describe, expect, it } from "vitest";
import { scheduleCheck, type ScheduledRun } from "./probe-schedule";

const run = (id: number, startedAt: string, conclusion: string | null = "success", status = "completed"): ScheduledRun =>
  ({ id, run_started_at: startedAt, created_at: startedAt, status, conclusion });
const now = new Date("2026-11-21T15:00:00Z");

describe("scheduleCheck", () => {
  it("passes when the newest successful scheduled run before this one started under 26 hours ago", () => {
    const r = scheduleCheck([run(5, "2026-11-21T08:46:00Z", "failure"), run(4, "2026-11-20T21:18:00Z")], 9, now);
    expect(r.ok).toBe(true);
    expect(r.line).toBe("The newest successful scheduled run started at 2026-11-20T21:18:00Z, 17 hours ago");
  });

  // A stopped or throttled schedule, or one that has only failed for a day, turns red.
  it("fails when the newest successful one started 26 hours ago or more, whatever ran since", () => {
    const r = scheduleCheck([run(5, "2026-11-21T08:46:00Z", "failure"), run(4, "2026-11-20T13:00:00Z")], 9, now);
    expect(r.ok).toBe(false);
    expect(r.line).toBe("The newest successful scheduled run started at 2026-11-20T13:00:00Z, 26 hours ago");
  });

  it("counts only finished, passing runs from before this one", () => {
    const runs = [run(10, "2026-11-21T14:00:00Z"), run(8, "2026-11-21T13:30:00Z", null, "in_progress"), run(7, "2026-11-21T12:00:00Z", "cancelled"), run(3, "2026-11-20T10:00:00Z")];
    expect(scheduleCheck(runs, 9, now)).toEqual({ ok: false, line: "The newest successful scheduled run started at 2026-11-20T10:00:00Z, 29 hours ago" });
  });

  it("fails when no successful scheduled run is found", () => {
    expect(scheduleCheck([run(5, "2026-11-21T08:46:00Z", "failure")], 9, now)).toEqual({ ok: false, line: "No successful scheduled run found" });
  });
});
