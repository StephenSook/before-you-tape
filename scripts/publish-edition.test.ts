import { describe, expect, it } from "vitest";
import bundled from "../rules/edition.json";
import { chooseEdition } from "../src/data/editionSource";
import { canonicalJson, parseEdition, sha256Hex } from "../src/engine/edition";
import live from "../rules/live-engines.json";
import { editionDocument, firestoreFields, publishEdition } from "./publish-edition";

// A live-engine list that knows every fact this build's edition reads, to test the write path itself.
const allFacts = new Set([...live.facts, "battery.numbersFrom"]);

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

describe("publishEdition", () => {
  const id = (bundled as { editionId: string }).editionId;
  const recorder = () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const lines: string[] = [];
    const fetchFake = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    return { calls, lines, fetchFake, log: (l: string) => { lines.push(l); } };
  };

  it("in a dry run writes nothing, needs no token, and prints the pin", async () => {
    const r = recorder();
    await publishEdition({ args: ["--dry-run"], token: undefined, raw: bundled, fetch: r.fetchFake, log: r.log });
    expect(r.calls).toHaveLength(0);
    const d = await editionDocument(bundled);
    expect(r.lines).toContain(`rules_edition_id     ${id}`);
    expect(r.lines).toContain(`rules_edition_sha256 ${d.sha256}`);
    expect(r.lines.join("\n")).toMatch(/not written \(--dry-run\)/);
  });

  it("writes the document once, at ruleEditions/{id}, with the operator's token", async () => {
    const r = recorder();
    await publishEdition({ args: [], token: "t0ken", raw: bundled, fetch: r.fetchFake, log: r.log, liveFacts: allFacts });
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0]?.url).toBe(`https://firestore.googleapis.com/v1/projects/before-you-tape-2026/databases/(default)/documents/ruleEditions/${id}`);
    expect(r.calls[0]?.init?.method).toBe("PATCH");
    expect((r.calls[0]?.init?.headers as Record<string, string>).Authorization).toBe("Bearer t0ken");
    expect(JSON.parse(String(r.calls[0]?.init?.body))).toEqual({ fields: firestoreFields(await editionDocument(bundled)) });
    expect(r.lines).toContain(`published ruleEditions/${id}`);
  });

  it("refuses to write an edition a live app build would refuse, and says so in a dry run", async () => {
    const r = recorder();
    await expect(publishEdition({ args: [], token: "t0ken", raw: bundled, fetch: r.fetchFake, log: r.log })).rejects.toThrow(/battery\.numbersFrom/);
    expect(r.calls).toHaveLength(0);
    const dry = recorder();
    await publishEdition({ args: ["--dry-run"], token: undefined, raw: bundled, fetch: dry.fetchFake, log: dry.log });
    expect(dry.lines.join("\n")).toMatch(/cannot be pinned: .*battery\.numbersFrom/);
  });

  it("refuses a real write with no token", async () => {
    const r = recorder();
    await expect(publishEdition({ args: [], token: "", raw: bundled, fetch: r.fetchFake, log: r.log, liveFacts: allFacts })).rejects.toThrow(/ACCESS_TOKEN/);
    expect(r.calls).toHaveLength(0);
  });
});
