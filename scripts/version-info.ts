// What dist/version.json records: the commit the build came from and whether the tree had uncommitted or
// untracked changes. Without git history (for example a ZIP download) the commit is "unknown" and the tree
// counts as dirty, since nothing shows it matches a commit; the build still finishes.
export type VersionInfo = { sha: string; dirty: boolean };

export function versionInfo(git: (args: readonly string[]) => string): VersionInfo {
  try {
    const sha = git(["rev-parse", "HEAD"]).trim();
    if (!/^[0-9a-f]{40}$/.test(sha)) return { sha: "unknown", dirty: true };
    return { sha, dirty: git(["status", "--porcelain"]).trim() !== "" };
  } catch {
    return { sha: "unknown", dirty: true };
  }
}
