import { describe, expect, it } from "vitest";
import bundled from "../rules/edition.json";
import { chooseEdition } from "../src/data/editionSource";
import { canonicalJson, parseEdition, sha256Hex } from "../src/engine/edition";
import { editionDocument, firestoreFields } from "./publish-edition";

describe("editionDocument", () => {
  it("names the document by the edition id and holds its canonical JSON and SHA-256", async () => {
    const d = await editionDocument(bundled);
    expect(d.id).toBe((bundled as { editionId: string }).editionId);
    expect(d.json).toBe(canonicalJson(bundled));
    expect(d.sha256).toBe(await sha256Hex(canonicalJson(bundled)));
  });

  it("produces a document the app accepts under that pin", async () => {
    // Newer means a higher revision; the app keeps its built-in edition otherwise.
    const newer = { ...(bundled as Record<string, unknown>), editionId: "byt-newer000001", revision: ((bundled as { revision?: number }).revision ?? 0) + 1 };
    const d = await editionDocument(newer);
    const chosen = await chooseEdition({
      bundled: parseEdition(bundled), bundledSha: await sha256Hex(canonicalJson(bundled)),
      wantId: d.id, wantSha: d.sha256, fetchRemote: async () => JSON.parse(d.json) as unknown,
    });
    expect(chosen.from).toBe("remote");
  });

  it("refuses an edition that does not parse, and writes plain string fields", async () => {
    await expect(editionDocument({ editionId: "byt-x", rules: "no" })).rejects.toThrow();
    expect(firestoreFields({ id: "byt-x", json: "{}", sha256: "a".repeat(64) })).toEqual({
      editionId: { stringValue: "byt-x" }, json: { stringValue: "{}" }, sha256: { stringValue: "a".repeat(64) },
    });
  });
});
