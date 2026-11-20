// The live hosting release, for the deploy's rollback (.github/workflows/deploy-live.yml).
//   record [--drill-sha <sha>]
//     before a deploy: writes version, sha, dirty and recorded_at to $GITHUB_OUTPUT
//   restore --version <id> --sha <sha> --dirty <b> --since <iso> [--require-clone]
//     after a failed check: puts that release back and proves it
// A release is the live channel's version id together with the commit and dirty flag its version.json names,
// read with the version on both sides so a release that changed mid-read is not trusted. record without
// --drill-sha turns a failed reading into a warning (the deploy goes ahead with no rollback); with it, the
// reading must succeed and name that commit, clean, or the run stops before deploying.
// restore clones only over a release this deploy made (the deploy account, at or after the record time),
// never over one a person or another tool published, and keeps within a fixed time so the step's own limit
// never cuts it off mid-verdict.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SITE = "before-you-tape-2026";
const DEPLOYER = "byt-deploy@before-you-tape-2026.iam.gserviceaccount.com";
const CLI = ["--yes", "firebase-tools@15.34.2"];
// New checks start only within this time. One check can take about 100 s (two channel reads of up to 45 s
// and a 10 s fetch), so the last one still ends inside the workflow's 8-minute limit for the rollback step.
const RESTORE_BUDGET_MS = 5 * 60_000;

export interface Served { sha: string; dirty: boolean }
export interface Release { version: string; sha: string; dirty: boolean }
export interface LiveRelease { version: string; time: string; user: string }
export interface Live {
  release(): Promise<LiveRelease>;
  served(): Promise<Served>;
  clone(version: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  now(): number;
}
export interface RestoreOptions { since: string; deployer: string; requireClone: boolean; budgetMs: number }

export function liveReleaseOf(channelList: unknown): LiveRelease {
  const channels = (channelList as { result?: { channels?: unknown } } | null)?.result?.channels;
  if (!Array.isArray(channels)) throw new Error("the channel list has no channels");
  type Channel = { name?: unknown; release?: { releaseTime?: unknown; releaseUser?: { email?: unknown }; version?: { name?: unknown } } };
  const live = (channels as Channel[]).find((c) => typeof c.name === "string" && c.name.endsWith("/channels/live"));
  const name = live?.release?.version?.name;
  if (typeof name !== "string") throw new Error("the live channel has no released version");
  const version = name.slice(name.lastIndexOf("/") + 1);
  if (!/^[0-9a-f]+$/.test(version)) throw new Error(`unexpected version name ${name}`);
  const time = live?.release?.releaseTime;
  const user = live?.release?.releaseUser?.email;
  return { version, time: typeof time === "string" ? time : "", user: typeof user === "string" ? user : "" };
}

export function servedOf(body: unknown): Served {
  const v = (body ?? {}) as { sha?: unknown; dirty?: unknown };
  if (typeof v.sha !== "string" || !/^[0-9a-f]{40}$/.test(v.sha) || typeof v.dirty !== "boolean") {
    throw new Error(`version.json is not a commit record: ${JSON.stringify(body)}`);
  }
  return { sha: v.sha, dirty: v.dirty };
}

export async function readRelease(live: Live): Promise<Release> {
  const before = await live.release();
  const served = await live.served();
  const after = await live.release();
  if (before.version !== after.version) throw new Error(`live changed while it was read (${before.version} then ${after.version})`);
  return { version: before.version, ...served };
}

export function isRestored(want: Release, now: Release): boolean {
  return now.version === want.version && now.sha === want.sha && now.dirty === want.dirty;
}

// "still_live": nothing to roll back. "ours": the live release was made by the deploy account at or after
// the record time, so this deploy made it. "not_ours": someone or something else did; it is left alone.
export function rollbackDecision(current: LiveRelease, want: Release, since: string, deployer: string): "still_live" | "ours" | "not_ours" {
  if (current.version === want.version) return "still_live";
  const at = Date.parse(current.time);
  return current.user === deployer && Number.isFinite(at) && at >= Date.parse(since) ? "ours" : "not_ours";
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function restore(live: Live, want: Release, o: RestoreOptions): Promise<{ cloned: boolean }> {
  const deadline = live.now() + o.budgetMs;
  let current: LiveRelease | null = null;
  while (current === null) {
    try {
      current = await live.release();
    } catch (e) {
      console.log(`reading the live release: ${message(e)}`);
      if (live.now() >= deadline) throw new Error(`ROLLBACK DID NOT START: the live release could not be read: ${message(e)}`, { cause: e });
      await live.sleep(5000);
    }
  }
  const decision = rollbackDecision(current, want, o.since, o.deployer);
  if (decision === "not_ours") {
    throw new Error(`live was changed by someone else (version ${current.version} by ${current.user || "unknown"} at ${current.time || "unknown"}); not rolling back`);
  }
  if (decision === "still_live" && o.requireClone) throw new Error("rollback drill: the deploy never replaced the recorded release, so there was nothing to roll back");
  const cloned = decision === "ours";
  if (cloned) {
    try {
      await live.clone(want.version);
    } catch (e) {
      // A drill must prove its own clone worked, so a failed clone fails it. Otherwise a clone whose answer
      // was lost may still have applied, and the checks below decide.
      if (o.requireClone) throw new Error(`rollback drill: the clone command failed: ${message(e)}`, { cause: e });
      console.log(`clone: ${message(e)}`);
    }
  }
  for (let i = 1; live.now() < deadline; i++) {
    try {
      const now = await readRelease(live);
      console.log(`attempt ${i}: live version ${now.version}, commit ${now.sha}, dirty ${now.dirty}`);
      if (isRestored(want, now)) return { cloned };
    } catch (e) {
      console.log(`attempt ${i}: ${message(e)}`);
    }
    await live.sleep(5000);
  }
  throw new Error(`ROLLBACK DID NOT RESTORE version ${want.version} (commit ${want.sha}): the live site needs a person now`);
}

const realLive: Live = {
  release: async () => liveReleaseOf(JSON.parse(execFileSync("npx", [...CLI, "hosting:channel:list", "--project", SITE, "--json"], { encoding: "utf8", timeout: 45_000 }))),
  served: async () => {
    const r = await fetch(`https://${SITE}.web.app/version.json?t=${Date.now()}`, { headers: { "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`version.json answered ${r.status}`);
    return servedOf(await r.json());
  },
  clone: async (version) => { execFileSync("npx", [...CLI, "hosting:clone", `${SITE}@${version}`, `${SITE}:live`, "--project", SITE], { stdio: "inherit", timeout: 60_000 }); },
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
};

function arg(argv: readonly string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main(argv: readonly string[]): Promise<void> {
  const [command] = argv;
  if (command === "record") {
    const drill = arg(argv, "--drill-sha");
    const recordedAt = new Date().toISOString();
    let release: Release;
    try {
      release = await readRelease(realLive);
      if (drill !== undefined && (release.sha !== drill || release.dirty)) {
        throw new Error(`a rollback drill needs live to serve ${drill}, clean, before it starts; it serves ${release.sha} dirty ${release.dirty}`);
      }
    } catch (e) {
      if (drill !== undefined) throw new Error(`rollback drill stopped before deploying: ${message(e)}`, { cause: e });
      console.log(`::warning::No rollback is possible for this deploy: the live release could not be read (${message(e)})`);
      return;
    }
    console.log(`Live before this deploy: version ${release.version}, commit ${release.sha}, dirty ${release.dirty}, recorded at ${recordedAt}`);
    const out = process.env.GITHUB_OUTPUT;
    if (out) appendFileSync(out, `version=${release.version}\nsha=${release.sha}\ndirty=${release.dirty}\nrecorded_at=${recordedAt}\n`);
    return;
  }
  if (command === "restore") {
    const version = arg(argv, "--version") ?? "";
    const sha = arg(argv, "--sha") ?? "";
    const dirty = arg(argv, "--dirty");
    const since = arg(argv, "--since") ?? "";
    if (!/^[0-9a-f]+$/.test(version) || !/^[0-9a-f]{40}$/.test(sha) || (dirty !== "true" && dirty !== "false") || !Number.isFinite(Date.parse(since))) {
      throw new Error("restore needs --version <hex id> --sha <40-character commit> --dirty true|false --since <ISO time>");
    }
    console.log(`::error::A check after the deploy failed. Restoring version ${version} (commit ${sha}) to live.`);
    const { cloned } = await restore(realLive, { version, sha, dirty: dirty === "true" },
      { since, deployer: DEPLOYER, requireClone: argv.includes("--require-clone"), budgetMs: RESTORE_BUDGET_MS });
    console.log(`::warning::Rolled back: live serves version ${version}, commit ${sha} again${cloned ? "" : " (it was still live; nothing was cloned)"}`);
    return;
  }
  throw new Error("usage: live-release.ts record [--drill-sha <sha>] | restore --version <id> --sha <sha> --dirty <true|false> --since <iso> [--require-clone]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    console.error(message(err));
    process.exit(1);
  });
}
