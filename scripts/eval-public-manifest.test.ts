import { describe, expect, it } from "vitest";
import pageids from "../eval/set/commons-pageids.json";
import manifest from "../eval/set/manifest.json";
import shipped from "../eval/set/manifest.public.json";
import type { SetManifest } from "../src/eval/loadSet";
import { BRANDS } from "../src/judge/brands.fixture";
import { commonsPage, publicManifest } from "./eval-public-manifest";

// Anywhere in the text, so a name inside a file name ("Pineng_PN-963") counts, but not inside a longer word.
const anywhere = (b: string) => new RegExp(`(?<![A-Za-z0-9])${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9])`, "i");

describe("the manifest the web app ships", () => {
  it("is the committed eval manifest with no descriptions and Commons sources by page id, as generated", () => {
    expect(shipped).toEqual(publicManifest(manifest as SetManifest, pageids.pages));
    expect(shipped.items.map((i) => i.itemId)).toEqual(manifest.items.map((i) => i.itemId));
    for (const item of shipped.items) {
      expect(Object.keys(item)).not.toContain("alt");
      expect(Object.keys(item.provenance)).not.toContain("fileUrl");
    }
  });

  it("links every Commons source by its page id, and has a page id for each", () => {
    const commons = manifest.items.filter((i) => i.provenance.sourcePage.includes("commons.wikimedia.org/wiki/File:"));
    expect(Object.keys(pageids.pages).sort()).toEqual(commons.map((i) => i.itemId).sort());
    for (const i of commons) {
      const page = pageids.pages[i.itemId as keyof typeof pageids.pages];
      expect(page.title.replace(/ /g, "_"), i.itemId).toBe(decodeURIComponent(i.provenance.sourcePage.split("/wiki/")[1]!));
      expect(shipped.items.find((s) => s.itemId === i.itemId)!.provenance.sourcePage).toBe(commonsPage(page.pageid));
    }
  });

  // The creator's name stays as each license asks, even where an account is named after a company.
  it("names no brand, maker or model outside the creators' names", () => {
    const text = JSON.stringify(shipped.items.map((i) => ({ ...i, provenance: { ...i.provenance, author: "" } })));
    for (const b of BRANDS) expect(anywhere(b).test(text), b).toBe(false);
    // The check can fail: the measured manifest names them, in its descriptions and in its Commons file names.
    expect(BRANDS.filter((b) => anywhere(b).test(JSON.stringify(manifest.items))).length).toBe(BRANDS.length);
  });
});
