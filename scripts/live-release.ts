// The live hosting release, for the deploy's rollback (.github/workflows/deploy-live.yml).
//   record [--drill-sha <sha>]                       before a deploy: writes version, sha and dirty to $GITHUB_OUTPUT
//   restore --version <id> --sha <sha> --dirty <b>   after a failed check: puts that release back and proves it
// A release is the live channel's version id together with the commit and dirty flag its version.json names.
// record trusts a reading only if the live version did not change while version.json was read. Without
// --drill-sha a failed reading is a warning (the deploy goes ahead with no rollback); with it, the reading
// must succeed and name that commit, clean, or the run stops before deploying.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SITE = "before-you-tape-2026";
const CLI = ["--yes", "firebase-tools@15.34.2"];

export interface Served { sha: string; dirty: boolean }
export interface Release { version: string; sha: string; dirty: boolean }
export interface Live {
  version(): Promise<string>;
  served(): Promise<Served>;
  clone(version: string): Promise<void>;
  sleep(ms: number): Promise<void>;
}

export function liveVersionOf(channelList: unknown): string {
  const channels = (channelList as { result?: { channels?: unknown } }).result?.channels;
  if (!Array.isArray(channels)) throw new Error("the channel list has no channels");
  const live = (channels as Array<{ name?: unknown; release?: { version?: { name?: unknown } } }>)
    .find((c) => typeof c.name === "string" && c.name.endsWith("/channels/live"));
  const name = live?.release?.version?.name;
  if (typeof name !== "string") throw new Error("the live channel has no released version");
  const version = name.slice(name.lastIndexOf("/") + 1);
  if (!/^[0-9a-f]+$/.test(version)) throw new Error(`unexpected version name ${name}`);
  return version;
}

export function servedOf(body: unknown): Served {
  const v = (body ?? {}) as { sha?: unknown; dirty?: unknown };
  if (typeof v.sha !== "string" || !/^[0-9a-f]{40}$/.test(v.sha) || typeof v.dirty !== "boolean") {
    throw new Error(`version.json is not a commit record: ${JSON.stringify(body)}`);
  }
  return { sha: v.sha, dirty: v.dirty };
}

export async function readRelease(live: Live): Promise<Release> {
  const before = await live.version();
  const served = await live.served();
  const after = await live.version();
  if (before !== after) throw new Error(`live changed while it was read (${before} then ${after})`);
  return { version: before, ...served };
}

export function isRestored(want: Release, version: string, served: Served): boolean {
  return version === want.version && served.sha === want.sha && served.dirty === want.dirty;
}

// Clones the recorded version back unless it is still live (a deploy that failed before publishing), then
// waits until the live channel holds that version and its version.json names the recorded commit and flag.
export async function restore(live: Live, want: Release, attempts = 20): Promise<{ cloned: boolean }> {
  const cloned = (await live.version()) !== want.version;
  if (cloned) await live.clone(want.version);
  for (let i = 1; i <= attempts; i++) {
    try {
      const version = await live.version();
      const served = await live.served();
      console.log(`attempt ${i}: live version ${version}, commit ${served.sha}, dirty ${served.dirty}`);
      if (isRestored(want, version, served)) return { cloned };
    } catch (e) {
      console.log(`attempt ${i}: ${e instanceof Error ? e.message : String(e)}`);
    }
    await live.sleep(5000);
  }
  throw new Error(`ROLLBACK DID NOT RESTORE version ${want.version} (commit ${want.sha}): the live site needs a person now`);
}

const realLive: Live = {
  version: async () => liveVersionOf(JSON.parse(execFileSync("npx", [...CLI, "hosting:channel:list", "--project", SITE, "--json"], { encoding: "utf8", timeout: 90_000 }))),
  served: async () => {
    const r = await fetch(`https://${SITE}.web.app/version.json?t=${Date.now()}`, { headers: { "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`version.json answered ${r.status}`);
    return servedOf(await r.json());
  },
  clone: async (version) => { execFileSync("npx", [...CLI, "hosting:clone", `${SITE}@${version}`, `${SITE}:live`, "--project", SITE], { stdio: "inherit", timeout: 120_000 }); },
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

function arg(argv: readonly string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main(argv: readonly string[]): Promise<void> {
  const [command] = argv;
  if (command === "record") {
    const drill = arg(argv, "--drill-sha");
    let release: Release;
    try {
      release = await readRelease(realLive);
      if (drill !== undefined && (release.sha !== drill || release.dirty)) {
        throw new Error(`a rollback drill needs live to serve ${drill}, clean, before it starts; it serves ${release.sha} dirty ${release.dirty}`);
      }
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      if (drill !== undefined) throw new Error(`rollback drill stopped before deploying: ${why}`, { cause: e });
      console.log(`::warning::No rollback is possible for this deploy: the live release could not be read (${why})`);
      return;
    }
    console.log(`Live before this deploy: version ${release.version}, commit ${release.sha}, dirty ${release.dirty}`);
    const out = process.env.GITHUB_OUTPUT;
    if (out) appendFileSync(out, `version=${release.version}\nsha=${release.sha}\ndirty=${release.dirty}\n`);
    return;
  }
  if (command === "restore") {
    const version = arg(argv, "--version") ?? "";
    const sha = arg(argv, "--sha") ?? "";
    const dirty = arg(argv, "--dirty");
    if (!/^[0-9a-f]+$/.test(version) || !/^[0-9a-f]{40}$/.test(sha) || (dirty !== "true" && dirty !== "false")) {
      throw new Error("restore needs --version <hex id> --sha <40-character commit> --dirty true|false");
    }
    console.log(`::error::A check after the deploy failed. Restoring version ${version} (commit ${sha}) to live.`);
    const { cloned } = await restore(realLive, { version, sha, dirty: dirty === "true" });
    console.log(`::warning::Rolled back: live serves version ${version}, commit ${sha} again${cloned ? "" : " (it was still live; nothing was cloned)"}`);
    return;
  }
  throw new Error("usage: live-release.ts record [--drill-sha <sha>] | restore --version <id> --sha <sha> --dirty <true|false>");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
