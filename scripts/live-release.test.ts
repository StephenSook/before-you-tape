// The deploy's rollback: what it records as the live release, and when it may and does put one back.
import { describe, expect, it } from "vitest";
import { isRestored, liveReleaseOf, readRelease, restore, rollbackDecision, servedOf, type Live, type LiveRelease, type Release, type Served } from "./live-release";

const sha = "a".repeat(40);
const other = "b".repeat(40);
const DEPLOYER = "deploy@example.iam.gserviceaccount.com";
const SINCE = "2026-11-20T03:00:00.000Z";
const rel = (version: string, time = "2026-11-20T03:05:00.000Z", user = DEPLOYER): LiveRelease => ({ version, time, user });
const channels = (r: LiveRelease) => ({ status: "success", result: { channels: [
  { name: "projects/p/sites/s/channels/preview", release: { version: { name: "projects/p/sites/s/versions/0000000000000001" } } },
  { name: "projects/p/sites/s/channels/live", releaseTime: "ignored", release: { releaseTime: r.time, releaseUser: { email: r.user }, version: { name: `projects/p/sites/s/versions/${r.version}` } } },
] } });

// A live site whose answers the test scripts. Each answer is a value or an Error to throw; the last repeats.
// Its clock moves only when it sleeps.
function fakeLive(releases: Array<LiveRelease | Error>, served: Served[], cloneError?: Error): Live & { clones: string[] } {
  const clones: string[] = [];
  let r = 0;
  let s = 0;
  let clock = 0;
  return {
    clones,
    release: async () => {
      const x = releases[Math.min(r++, releases.length - 1)]!;
      if (x instanceof Error) throw x;
      return x;
    },
    served: async () => served[Math.min(s++, served.length - 1)]!,
    clone: async (version) => { clones.push(version); if (cloneError) throw cloneError; },
    sleep: async (ms) => { clock += ms; },
    now: () => clock,
  };
}
const opts = { since: SINCE, deployer: DEPLOYER, requireClone: false, budgetMs: 60_000 };

describe("reading the live release", () => {
  it("takes the live channel's version id, release time and releaser, and the commit its version.json names", () => {
    expect(liveReleaseOf(channels(rel("12d3e5df8690c0d9")))).toEqual(rel("12d3e5df8690c0d9"));
    expect(servedOf({ sha, dirty: false, builtAt: "x" })).toEqual({ sha, dirty: false });
  });

  it("refuses a list with no live release, and a version.json that is not a commit record", () => {
    expect(() => liveReleaseOf({ result: { channels: [] } })).toThrow(/no released version/);
    expect(() => liveReleaseOf({})).toThrow(/no channels/);
    expect(() => servedOf({ sha: "unknown", dirty: true })).toThrow(/not a commit record/);
    expect(() => servedOf({ sha })).toThrow(/not a commit record/);
  });

  it("trusts a release only if the live version did not change while its version.json was read", async () => {
    expect(await readRelease(fakeLive([rel("v1")], [{ sha, dirty: false }]))).toEqual({ version: "v1", sha, dirty: false });
    await expect(readRelease(fakeLive([rel("v1"), rel("v2")], [{ sha, dirty: false }]))).rejects.toThrow(/live changed while it was read/);
  });
});

describe("deciding whether to roll back", () => {
  const want: Release = { version: "v1", sha, dirty: false };

  it("rolls back only a release this deploy made: by the deploy account, at or after the record time", () => {
    expect(rollbackDecision(rel("v1"), want, SINCE, DEPLOYER)).toBe("still_live");
    expect(rollbackDecision(rel("v2"), want, SINCE, DEPLOYER)).toBe("ours");
    expect(rollbackDecision(rel("v2", "2026-11-20T03:05:00.000Z", "someone@example.com"), want, SINCE, DEPLOYER)).toBe("not_ours");
    expect(rollbackDecision(rel("v2", "2026-11-20T02:59:00.000Z"), want, SINCE, DEPLOYER)).toBe("not_ours");
  });

  it("counts as restored only with the recorded version id, commit and dirty flag", () => {
    expect(isRestored(want, { version: "v1", sha, dirty: false })).toBe(true);
    expect(isRestored(want, { version: "v2", sha, dirty: false })).toBe(false);
    expect(isRestored(want, { version: "v1", sha, dirty: true })).toBe(false);
    expect(isRestored(want, { version: "v1", sha: other, dirty: false })).toBe(false);
  });
});

describe("restoring a release", () => {
  const want: Release = { version: "v1", sha, dirty: false };

  it("clones the recorded version back over this deploy's release, then waits for it", async () => {
    const live = fakeLive([rel("v2"), rel("v2"), rel("v2"), rel("v1")], [{ sha: other, dirty: false }, { sha, dirty: false }]);
    expect(await restore(live, want, opts)).toEqual({ cloned: true });
    expect(live.clones).toEqual(["v1"]);
  });

  it("retries a failed first read of the live release instead of giving up before it starts", async () => {
    const live = fakeLive([new Error("channel list timed out"), rel("v2"), rel("v1")], [{ sha, dirty: false }]);
    expect(await restore(live, want, opts)).toEqual({ cloned: true });
    expect(live.clones).toEqual(["v1"]);
  });

  it("still checks the site when the clone command fails, since the clone may have applied", async () => {
    const live = fakeLive([rel("v2"), rel("v1")], [{ sha, dirty: false }], new Error("clone timed out"));
    expect(await restore(live, want, opts)).toEqual({ cloned: true });
  });

  it("clones nothing when the recorded version is still live (the deploy never published)", async () => {
    const live = fakeLive([rel("v1")], [{ sha, dirty: false }]);
    expect(await restore(live, want, opts)).toEqual({ cloned: false });
    expect(live.clones).toEqual([]);
  });

  it("never touches a release someone else made, and says so", async () => {
    const live = fakeLive([rel("v9", "2026-11-20T03:10:00.000Z", "person@example.com")], [{ sha: other, dirty: false }]);
    await expect(restore(live, want, opts)).rejects.toThrow(/someone else.*not rolling back/);
    expect(live.clones).toEqual([]);
  });

  it("fails a drill whose clone command fails, even if the recorded release then shows up", async () => {
    const live = fakeLive([rel("v2"), rel("v1")], [{ sha, dirty: false }], new Error("clone refused"));
    await expect(restore(live, want, { ...opts, requireClone: true })).rejects.toThrow(/drill: the clone command failed: clone refused/);
  });

  it("fails a drill whose deploy never replaced the recorded release, since nothing was rolled back", async () => {
    const live = fakeLive([rel("v1")], [{ sha, dirty: false }]);
    await expect(restore(live, want, { ...opts, requireClone: true })).rejects.toThrow(/drill.*nothing to roll back/);
  });

  it("fails loudly when the live site never serves the recorded release within the time it has", async () => {
    const live = fakeLive([rel("v2"), rel("v3")], [{ sha, dirty: false }]);
    await expect(restore(live, want, { ...opts, budgetMs: 20_000 })).rejects.toThrow(/ROLLBACK DID NOT RESTORE version v1/);
  });
});
