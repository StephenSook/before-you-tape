// A cron is no liveness guarantee: GitHub delays scheduled runs by hours and can stop them. This fails when the
// newest successful scheduled Live probe run before this one started 26 hours ago or more, so a stopped, throttled
// or failing schedule shows red on the next run of the workflow (and in GitHub's failure email). It cannot alarm
// when no run starts at all; an outside uptime check covers that.
//
//   gh api .../actions/workflows/probe-live.yml/runs -f event=schedule ... > runs.json
//   npx tsx scripts/probe-schedule.ts runs.json <this run id>
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface ScheduledRun { id: number; run_started_at: string | null; created_at: string; status: string; conclusion: string | null }

const LIMIT_HOURS = 26;

export function scheduleCheck(runs: readonly ScheduledRun[], thisRunId: number, now: Date): { ok: boolean; line: string } {
  // Run ids only grow, so runs with a smaller id came before this one. Its start time, not its creation time, is when it ran.
  const passed = runs
    .filter((r) => r.id < thisRunId && r.status === "completed" && r.conclusion === "success")
    .map((r) => r.run_started_at ?? r.created_at)
    .sort()
    .reverse();
  const newest = passed[0];
  if (!newest) return { ok: false, line: "No successful scheduled run found" };
  const hours = Math.floor((now.getTime() - Date.parse(newest)) / 3_600_000);
  return { ok: hours < LIMIT_HOURS, line: `The newest successful scheduled run started at ${newest}, ${hours} hours ago` };
}

function main() {
  const [file, id] = process.argv.slice(2);
  if (!file || !id || !/^\d+$/.test(id)) throw new Error("usage: probe-schedule.ts <runs.json> <this run id>");
  const body = JSON.parse(readFileSync(file, "utf8")) as { workflow_runs?: ScheduledRun[] };
  const { ok, line } = scheduleCheck(body.workflow_runs ?? [], Number(id), new Date());
  console.log(ok ? line : `::error::${line}`);
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (e) { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); }
}
