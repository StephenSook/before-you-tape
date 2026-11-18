import { describe, expect, it } from "vitest";
import { findToneHits, checkFiles } from "./tone-check";

const ch = (n: number) => String.fromCharCode(n);

describe("findToneHits", () => {
  it("flags long dashes and curly quotes only", () => {
    expect(findToneHits("a " + ch(8212) + " b")).toHaveLength(1);
    expect(findToneHits("3" + ch(8211) + "5")).toHaveLength(1);
    expect(findToneHits(ch(8220) + "x" + ch(8221))).toHaveLength(2);
    expect(findToneHits("plain - \"ok\"")).toHaveLength(0);
  });

  it("flags curly single quotes and reports the index and char", () => {
    expect(findToneHits("it" + ch(8217) + "s")).toEqual([{ index: 2, char: ch(8217) }]);
    expect(findToneHits(ch(8216) + "x")).toEqual([{ index: 0, char: ch(8216) }]);
  });
});

describe("checkFiles", () => {
  it("passes clean files and reports the line of a hit", () => {
    expect(checkFiles([{ path: "a.md", text: "fine\nalso fine" }], 1).ok).toBe(true);
    const r = checkFiles([{ path: "b.md", text: "one\ntwo " + ch(8212) + " three" }], 1);
    expect(r.ok).toBe(false);
    expect(r.messages[0]).toContain("b.md:2:");
  });

  it("fails when it walked fewer files than the floor", () => {
    const r = checkFiles([], 1);
    expect(r.ok).toBe(false);
    expect(r.messages.join("\n")).toMatch(/walked 0 files/);
  });
});
