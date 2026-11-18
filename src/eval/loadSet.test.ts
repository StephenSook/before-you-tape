import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { jpegMetadataBlocks } from "../../scripts/photo-check";
import { buildEvalSet, type SetLabels, type SetManifest } from "./loadSet";
import { setProblems } from "./manifest";

const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const prov = { sourcePage: "https://commons.wikimedia.org/wiki/File:X.jpg", author: "A", license: "CC0 1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", changes: "re-encoded" };
const mItem = (itemId: string) => ({ itemId, photo: `/eval/items/${itemId}.jpg`, photoSha256: "a".repeat(64), photoSha256Original: "b".repeat(64), widthPx: 1, heightPx: 1, alt: itemId, printed: null, provenance: prov });
const tiny: SetManifest = { setId: "s", destinations: [{ code: "CA", name: "Canada" }, { code: "PH", name: "Philippines" }], publishing: { maxSide: 1600, jpegQuality: 88 }, protocolSha256: "", labelsSha256: "", items: [mItem("mug"), mItem("shirt")] };
const tinyLabels: SetLabels = { setId: "s", status: "draft", items: {
  mug: { CA: { expected: "ok", section: "none" }, PH: { expected: "take_out", section: "PH-P-01" } },
  shirt: { CA: { expected: "ok", section: "none" }, PH: { expected: "ok", section: "none" } },
} };

describe("buildEvalSet", () => {
  it("joins the manifest and the labels, and derives the hazard flag from the labels only", () => {
    const set = buildEvalSet(tiny, tinyLabels);
    expect(set.destinations).toEqual(["CA", "PH"]);
    expect(set.items.map((i) => [i.itemId, i.hazard])).toEqual([["mug", true], ["shirt", false]]);
    expect(set.items[0]!.truth.PH).toEqual({ expected: "take_out", section: "PH-P-01" });
  });

  it("refuses labels for another set or an item without labels", () => {
    expect(() => buildEvalSet(tiny, { ...tinyLabels, setId: "other" })).toThrow(/labels are for set "other", not "s"/);
    expect(() => buildEvalSet(tiny, { ...tinyLabels, items: { mug: tinyLabels.items.mug! } })).toThrow(/shirt has no labels/);
  });
});

describe("the committed eval set", () => {
  const manifest = JSON.parse(readFileSync("eval/set/manifest.json", "utf8")) as SetManifest;
  const labelsText = readFileSync("eval/set/labels.json", "utf8");
  const labels = JSON.parse(labelsText) as SetLabels;
  const set = buildEvalSet(manifest, labels);

  it("passes every manifest check with 40 items and labels for exactly those items", () => {
    expect(setProblems(set, 40)).toEqual([]);
    expect(Object.keys(labels.items).sort()).toEqual(manifest.items.map((i) => i.itemId).sort());
  });

  it("publishes every photo with its manifest hash and no metadata block", () => {
    for (const i of manifest.items) {
      const file = `public${i.photo}`;
      expect(existsSync(file), file).toBe(true);
      const buf = readFileSync(file);
      expect(sha(buf), i.itemId).toBe(i.photoSha256);
      expect(jpegMetadataBlocks(buf), i.itemId).toEqual([]);
    }
  });

  it("pins the protocol and the labels by hash once frozen, and pins nothing before", () => {
    if (labels.status.startsWith("frozen")) {
      expect(manifest.labelsSha256).toBe(sha(labelsText));
      expect(manifest.protocolSha256).toBe(sha(readFileSync("eval/PROTOCOL.md")));
    } else {
      expect([manifest.labelsSha256, manifest.protocolSha256]).toEqual(["", ""]);
    }
  });
});
