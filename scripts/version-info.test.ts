// The build's version record: the commit and whether the tree was dirty, or "unknown" when the source has no
// git history (for example a ZIP download), so such a build still finishes.
import { describe, expect, it } from "vitest";
import { versionInfo } from "./version-info";

const sha = "0123456789abcdef0123456789abcdef01234567";
const git = (out: Record<string, string>) => (args: readonly string[]) => {
  const key = args.join(" ");
  if (!(key in out)) throw new Error(`fatal: not a git repository (${key})`);
  return out[key]!;
};

describe("versionInfo", () => {
  it("records the commit and a clean tree", () => {
    expect(versionInfo(git({ "rev-parse HEAD": `${sha}\n`, "status --porcelain": "" }))).toEqual({ sha, dirty: false });
  });

  it("records a dirty tree", () => {
    expect(versionInfo(git({ "rev-parse HEAD": sha, "status --porcelain": " M src/app.tsx\n" }))).toEqual({ sha, dirty: true });
  });

  it("says unknown, and dirty, when there is no git history", () => {
    expect(versionInfo(git({}))).toEqual({ sha: "unknown", dirty: true });
  });

  it("says unknown when git answers with something that is not a commit", () => {
    expect(versionInfo(git({ "rev-parse HEAD": "HEAD", "status --porcelain": "" }))).toEqual({ sha: "unknown", dirty: true });
  });
});
