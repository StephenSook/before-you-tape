// The deploy's rollback: what it records as the live release, and when a restore counts as done.
import { describe, expect, it } from "vitest";
import { isRestored, liveVersionOf, readRelease, restore, servedOf, type Live, type Release, type Served } from "./live-release";

const sha = "a".repeat(40);
const other = "b".repeat(40);
const channels = (version: string) => ({ status: "success", result: { channels: [
  { name: "projects/p/sites/s/channels/preview", release: { version: { name: "projects/p/sites/s/versions/0000000000000001" } } },
  { name: "projects/p/sites/s/channels/live", release: { version: { name: `projects/p/sites/s/versions/${version}` } } },
] } });

// A live site whose answers the test scripts: versions in order (the last one repeats), served records in order.
function fakeLive(versions: string[], served: Served[]): Live & { clones: string[] } {
  const clones: string[] = [];
  let v = 0;
  let s = 0;
  return {
    clones,
    version: async () => versions[Math.min(v++, versions.length - 1)]!,
    served: async () => served[Math.min(s++, served.length - 1)]!,
    clone: async (version) => { clones.push(version); },
    sleep: async () => {},
  };
}

describe("reading the live release", () => {
  it("takes the live channel's version id and the commit its version.json names", () => {
    expect(liveVersionOf(channels("12d3e5df8690c0d9"))).toBe("12d3e5df8690c0d9");
    expect(servedOf({ sha, dirty: false, builtAt: "x" })).toEqual({ sha, dirty: false });
  });

  it("refuses a list with no live release, and a version.json that is not a commit record", () => {
    expect(() => liveVersionOf({ result: { channels: [] } })).toThrow(/no released version/);
    expect(() => liveVersionOf({})).toThrow(/no channels/);
    expect(() => servedOf({ sha: "unknown", dirty: true })).toThrow(/not a commit record/);
    expect(() => servedOf({ sha })).toThrow(/not a commit record/);
  });

  it("trusts a release only if the live version did not change while its version.json was read", async () => {
    expect(await readRelease(fakeLive(["v1"], [{ sha, dirty: false }]))).toEqual({ version: "v1", sha, dirty: false });
    await expect(readRelease(fakeLive(["v1", "v2"], [{ sha, dirty: false }]))).rejects.toThrow(/live changed while it was read/);
  });
});

describe("restoring a release", () => {
  const want: Release = { version: "v1", sha, dirty: false };

  it("counts as restored only with the recorded version id, commit and dirty flag", () => {
    expect(isRestored(want, "v1", { sha, dirty: false })).toBe(true);
    expect(isRestored(want, "v2", { sha, dirty: false })).toBe(false);
    expect(isRestored(want, "v1", { sha, dirty: true })).toBe(false);
    expect(isRestored(want, "v1", { sha: other, dirty: false })).toBe(false);
  });

  it("clones the recorded version back when another one is live, then waits for it", async () => {
    const live = fakeLive(["v2", "v2", "v1"], [{ sha: other, dirty: false }, { sha, dirty: false }]);
    expect(await restore(live, want)).toEqual({ cloned: true });
    expect(live.clones).toEqual(["v1"]);
  });

  it("clones nothing when the recorded version is still live (the deploy never published)", async () => {
    const live = fakeLive(["v1"], [{ sha, dirty: false }]);
    expect(await restore(live, want)).toEqual({ cloned: false });
    expect(live.clones).toEqual([]);
  });

  it("fails loudly when the live site never serves the recorded release", async () => {
    const live = fakeLive(["v2", "v3"], [{ sha, dirty: false }]);
    await expect(restore(live, want, 3)).rejects.toThrow(/ROLLBACK DID NOT RESTORE version v1/);
  });
});
