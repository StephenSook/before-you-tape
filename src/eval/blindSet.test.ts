import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { blindSetOf } from "./blindSet";
import type { SetManifest } from "./loadSet";
import { creditLine } from "./manifest";

const manifest = JSON.parse(readFileSync("eval/set/manifest.json", "utf8")) as SetManifest;

describe("blindSetOf", () => {
  const blind = blindSetOf(manifest);

  it("lists every item once with its photo, alt text and credit, and nothing about the answers", () => {
    expect(blind.setId).toBe(manifest.setId);
    expect(blind.destinations).toEqual(manifest.destinations);
    expect(blind.items.map((i) => i.itemId).sort()).toEqual(manifest.items.map((i) => i.itemId).sort());
    const byId = new Map(manifest.items.map((i) => [i.itemId, i]));
    for (const b of blind.items) {
      const m = byId.get(b.itemId)!;
      expect(b).toEqual({ itemId: m.itemId, photo: m.photo, alt: m.alt, credit: creditLine(m) });
    }
    expect(JSON.stringify(blind)).not.toMatch(/"(expected|section|hazard|truth|printed|evidence)":/);
  });

  it("shuffles the order the same way every time, so the hazard items are not grouped", () => {
    expect(blindSetOf(manifest).items.map((i) => i.itemId)).toEqual(blind.items.map((i) => i.itemId));
    expect(blind.items.map((i) => i.itemId)).not.toEqual(manifest.items.map((i) => i.itemId));
  });
});
