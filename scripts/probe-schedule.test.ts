import { describe, expect, it } from "vitest";
import { scheduleCheck, type ScheduledRun } from "./probe-schedule";

const run = (id: number, startedAt: string, conclusion: string | null = "success", status = "completed", event = "schedule"): ScheduledRun =>
  ({ id, run_started_at: startedAt, created_at: startedAt, status, conclusion, event });
const now = new Date("2026-11-21T15:00:00Z");

// The question is whether GitHub still starts the schedule. A scheduled run that ran and failed answers yes;
// whether the site is up is the probe, rules-fresh and read jobs' question, in that same run.
describe("scheduleCheck", () => {
  it("passes when a scheduled run before this one finished, even failed, and started under 26 hours ago", () => {
    const r = scheduleCheck([run(5, "2026-11-21T08:46:00Z", "failure"), run(4, "2026-11-20T21:18:00Z")], 9, now);
    expect(r).toEqual({ ok: true, line: "The newest finished scheduled run started at 2026-11-21T08:46:00Z, 6 hours ago (failure)" });
  });

  it("fails when no scheduled run has started in the last 26 hours", () => {
    const r = scheduleCheck([run(4, "2026-11-20T13:00:00Z", "failure"), run(3, "2026-11-20T01:00:00Z")], 9, now);
    expect(r).toEqual({ ok: false, line: "The newest finished scheduled run started at 2026-11-20T13:00:00Z, 26 hours ago (failure)" });
  });

  it("counts only finished scheduled runs from before this one, cancelled ones included", () => {
    const runs = [
      run(10, "2026-11-21T14:00:00Z"),
      run(8, "2026-11-21T13:30:00Z", null, "in_progress"),
      run(7, "2026-11-21T12:00:00Z", "success", "completed", "workflow_dispatch"),
      run(6, "2026-11-21T11:00:00Z", "cancelled"),
      run(3, "2026-11-20T10:00:00Z"),
    ];
    expect(scheduleCheck(runs, 9, now)).toEqual({ ok: true, line: "The newest finished scheduled run started at 2026-11-21T11:00:00Z, 4 hours ago (cancelled)" });
    expect(scheduleCheck(runs.filter((r) => r.id !== 6), 9, now).ok).toBe(false);
  });

  it("fails when no finished scheduled run is found", () => {
    expect(scheduleCheck([run(8, "2026-11-21T13:30:00Z", null, "in_progress")], 9, now)).toEqual({ ok: false, line: "No finished scheduled run found" });
  });
});
