import { describe, expect, it } from "vitest";
import { creditLine, OWN_PHOTO_LICENSE, setProblems } from "./manifest";
import type { EvalItem, EvalSet } from "./types";

const open = (itemId: string, license: string, licenseUrl: string): EvalItem => ({
  itemId, photo: `/eval/items/${itemId}.jpg`, photoSha256: "a".repeat(64), hazard: true, printed: null,
  truth: { CA: { expected: "ok", section: "IMM Canada" }, PH: { expected: "take_out", section: "IMM Philippines PH-P-01" } },
  provenance: { sourcePage: "https://commons.wikimedia.org/wiki/File:X.jpg", author: "Jane Roe", license, licenseUrl, changes: "resized, metadata removed" },
});
const own = (itemId: string): EvalItem => ({ ...open(itemId, OWN_PHOTO_LICENSE, ""), provenance: { sourcePage: "", author: "Stephen Sookra (project owner)", license: OWN_PHOTO_LICENSE, licenseUrl: "", changes: "resized" } });
const setOf = (items: EvalItem[], n = items.length): EvalSet => ({ setId: "s", manifestSha256: "", protocolSha256: "", destinations: ["CA", "PH"], items: items.slice(0, n) });

describe("setProblems", () => {
  it("accepts open licenses and the owner's own photos", () => {
    const items = [open("a", "CC0 1.0", "https://creativecommons.org/publicdomain/zero/1.0/"), open("b", "CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"),
      open("c", "CC BY-SA 3.0", "https://creativecommons.org/licenses/by-sa/3.0/"), open("d", "Public domain", "https://commons.wikimedia.org/wiki/Public_domain"), own("e")];
    expect(setProblems(setOf(items), 5)).toEqual([]);
  });

  it("refuses a license outside the set, a missing provenance field, and an owner's photo labelled CC0", () => {
    const problems = setProblems(setOf([
      open("a", "CC BY-NC 4.0", "https://creativecommons.org/licenses/by-nc/4.0/"),
      { ...open("b", "CC0 1.0", "https://creativecommons.org/publicdomain/zero/1.0/"), provenance: { sourcePage: "", author: "", license: "CC0 1.0", licenseUrl: "x", changes: "resized" } },
      { ...own("c"), provenance: { sourcePage: "", author: "Stephen Sookra (project owner)", license: "CC0 1.0", licenseUrl: "", changes: "resized" } },
    ]), 3);
    expect(problems.join("\n")).toMatch(/a: license "CC BY-NC 4.0" is not allowed/);
    expect(problems.join("\n")).toMatch(/b: provenance needs sourcePage, author and an https licenseUrl/);
    expect(problems.join("\n")).toMatch(/c: the project owner's photo must carry the own-photo license, not an open one/);
  });

  it("refuses a wrong count, repeated ids, a bad hash, and a destination without a label", () => {
    const dup = open("a", "CC0 1.0", "https://creativecommons.org/publicdomain/zero/1.0/");
    const noPh = { ...open("b", "CC0 1.0", "https://creativecommons.org/publicdomain/zero/1.0/"), photoSha256: "xyz", truth: { CA: { expected: "ok" as const, section: "s" } } };
    const problems = setProblems(setOf([dup, dup, noPh]), 40).join("\n");
    expect(problems).toMatch(/expected 40 items, found 3/);
    expect(problems).toMatch(/a: repeated item id/);
    expect(problems).toMatch(/b: photoSha256 is not a SHA-256/);
    expect(problems).toMatch(/b: no label for PH/);
  });
});

describe("setProblems on changes", () => {
  it("requires every photo to say how the published copy was changed", () => {
    const a = open("a", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/");
    expect(setProblems(setOf([{ ...a, provenance: { ...a.provenance, changes: " " } }]), 1).join("\n")).toMatch(/a: provenance needs changes/);
  });
});

describe("setProblems on the hazard flag", () => {
  it("requires hazard exactly when some destination's label is not OK to pack", () => {
    const lotion = open("lotion", "CC0 1.0", "https://creativecommons.org/publicdomain/zero/1.0/");
    const shirt = { ...open("shirt", "CC0 1.0", "https://creativecommons.org/publicdomain/zero/1.0/"), hazard: false, truth: { CA: { expected: "ok" as const, section: "s" }, PH: { expected: "ok" as const, section: "s" } } };
    expect(setProblems(setOf([lotion, shirt]), 2)).toEqual([]);
    const problems = setProblems(setOf([{ ...lotion, hazard: false }, { ...shirt, hazard: true }]), 2).join("\n");
    expect(problems).toMatch(/lotion: hazard must be true: a destination's label is not OK to pack/);
    expect(problems).toMatch(/shirt: hazard must be false: every destination's label is OK to pack/);
  });
});

describe("creditLine", () => {
  it("credits open photos by author, license and source, and the owner's in plain words", () => {
    expect(creditLine(open("a", "CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"))).toBe("Photo: Jane Roe, CC BY 4.0, commons.wikimedia.org (resized, metadata removed)");
    expect(creditLine(own("e"))).toBe("Photo by the project owner");
  });
});
