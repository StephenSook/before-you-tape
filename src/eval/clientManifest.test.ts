import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The web app ships eval/set/manifest.public.json, never the measured manifest, whose descriptions and file names
// name brands, makers and models. Tests and scripts may read the measured one.
describe("the eval manifest the app imports", () => {
  it("is the public copy in every app source file", () => {
    const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "src"], { encoding: "utf8" })
      .split("\n").filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.endsWith(".fixture.ts"));
    expect(files.length).toBeGreaterThan(50);
    const measured = files.filter((f) => /from "[./]*eval\/set\/manifest\.json"/.test(readFileSync(f, "utf8")));
    expect(measured).toEqual([]);
  });
});
