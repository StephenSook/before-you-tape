import { describe, expect, it } from "vitest";
import { findPrivateTerms, hygieneVerdict } from "./hygiene-guard";

// Planted terms are built from pieces, so this file names none of them itself.
const j = (...parts: string[]) => parts.join("");
const file = (path: string, text: string) => ({ path, text });
const clean = [file("src/a.ts", "export const a = 1;"), file("README.md", "Before You Tape checks a box before it is taped.")];

describe("findPrivateTerms", () => {
  it("finds each private term with its place, in any case and with a plural or possessive", () => {
    for (const bad of [
      `Source: ${j("orches", "trator")} (the switch order).`,
      `the ${j("ORCHES", "TRATOR")}'s ruling`,
      `two ${j("coordi", "nators")} agreed`,
      `see ${j("Gal", "axy")} playbook`,
      `the ${j("Soo", "kra")} Methodology`,
      `kept in the ${j("va", "ult")}`,
      `an ${j("Obsi", "dian")} note`,
      `from ${j("rese", "arch")}/${j("bu", "ild")}/desk-pass/gen.py`,
      `in ~/dev/${j("Build", "Hybrid", "AI")}`,
      `per ${j("H", "R")}201`,
      `per ${j("H", "R")} 56`,
      `read ~/.${j("cla", "ude")}/settings.json`,
      `open /${j("Us", "ers")}/someone/dev/x`,
    ]) {
      const found = findPrivateTerms([file("docs/x.md", `first line\n  ${bad}`)]);
      expect(found.length, bad).toBe(1);
      expect(found[0], bad).toMatch(/^docs\/x\.md:2:\d+ /);
    }
  });

  it("passes ordinary text, the author's own name, and words that only contain a term", () => {
    const text = [
      `Copyright 2026 Stephen ${j("Soo", "kra")}`,
      "HTTP 500 and HRT are fine; so is a vaulted ceiling and a galaxies-free sentence about coordinates.",
      "research shows build steps; /usr/local/bin and ~/dev are not home paths",
    ].join("\n");
    expect(findPrivateTerms([...clean, file("NOTICE", text)])).toEqual([]);
  });
});

describe("hygieneVerdict", () => {
  const dirty = [...clean, file("CHANGELOG.md", `Source: ${j("orches", "trator")}.`)];

  it("reports while the repository is private and fails once it is public", () => {
    const priv = hygieneVerdict(dirty, 2, { repoPrivate: "true", ci: true });
    expect(priv.exitCode).toBe(0);
    expect(priv.messages.join("\n")).toMatch(/CHANGELOG\.md:1:\d+ .*would fail once the repository is public/);
    const pub = hygieneVerdict(dirty, 2, { repoPrivate: "false", ci: true });
    expect(pub.exitCode).toBe(1);
    expect(hygieneVerdict(clean, 2, { repoPrivate: "false", ci: true }).exitCode).toBe(0);
  });

  it("fails closed in CI when the visibility flag is missing, and only reports locally", () => {
    expect(hygieneVerdict(dirty, 2, { repoPrivate: undefined, ci: true }).exitCode).toBe(1);
    expect(hygieneVerdict(dirty, 2, { repoPrivate: "", ci: true }).exitCode).toBe(1);
    expect(hygieneVerdict(dirty, 2, { repoPrivate: undefined, ci: false }).exitCode).toBe(0);
  });

  it("fails in every mode when it walked fewer files than the floor", () => {
    for (const repoPrivate of ["true", "false", undefined]) {
      const r = hygieneVerdict(clean, 3, { repoPrivate, ci: true });
      expect(r.exitCode, String(repoPrivate)).toBe(1);
      expect(r.messages.join("\n")).toMatch(/walked 2 files, expected at least 3/);
    }
  });
});
