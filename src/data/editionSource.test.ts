import { describe, expect, it, vi } from "vitest";
import bundledRaw from "../../rules/edition.json";
import { canonicalJson, parseEdition, sha256Hex } from "../engine/edition";
import { chooseEdition } from "./editionSource";

const bundled = parseEdition(bundledRaw);
const shaOf = (v: unknown) => sha256Hex(canonicalJson(v));
const remote = { ...(bundledRaw as Record<string, unknown>), editionId: "byt-newer000001" };

describe("chooseEdition", async () => {
  const bundledSha = await shaOf(bundledRaw);
  const base = { bundled, bundledSha, wantId: "", wantSha: "", fetchRemote: vi.fn(async () => null) };

  it("uses the built-in edition, with no fetch, when Remote Config names none or names the built-in one", async () => {
    for (const want of [{ wantId: "", wantSha: "" }, { wantId: bundled.editionId, wantSha: bundledSha }]) {
      const fetchRemote = vi.fn(async () => remote);
      expect(await chooseEdition({ ...base, ...want, fetchRemote })).toEqual({ edition: bundled, from: "bundled", notice: null });
      expect(fetchRemote).not.toHaveBeenCalled();
    }
  });

  it("uses a remote edition only when its hash matches", async () => {
    const wantSha = await shaOf(remote);
    const got = await chooseEdition({ ...base, wantId: "byt-newer000001", wantSha, fetchRemote: async () => remote });
    expect(got).toMatchObject({ from: "remote", notice: null });
    expect(got.edition.editionId).toBe("byt-newer000001");
    expect(await chooseEdition({ ...base, wantId: "byt-newer000001", wantSha: "0".repeat(64), fetchRemote: async () => remote }))
      .toMatchObject({ edition: bundled, from: "bundled", notice: "A newer rule edition failed its integrity check. Using the built-in edition." });
  });

  it("keeps the built-in edition when the remote one is missing, cannot be fetched, has another id, or does not parse", async () => {
    const wantSha = await shaOf(remote);
    const want = { ...base, wantId: "byt-newer000001", wantSha };
    expect(await chooseEdition({ ...want, fetchRemote: async () => null })).toMatchObject({ from: "bundled", notice: "A newer rule edition could not be loaded. Using the built-in edition." });
    expect(await chooseEdition({ ...want, fetchRemote: async () => { throw new Error("offline"); } })).toMatchObject({ from: "bundled", notice: "A newer rule edition could not be loaded. Using the built-in edition." });
    expect(await chooseEdition({ ...want, wantId: "byt-other", fetchRemote: async () => remote })).toMatchObject({ from: "bundled", notice: "A newer rule edition failed its integrity check. Using the built-in edition." });
    const broken = { editionId: "byt-newer000001", rules: "no" };
    expect(await chooseEdition({ ...want, wantSha: await shaOf(broken), fetchRemote: async () => broken })).toMatchObject({ from: "bundled", notice: "A newer rule edition could not be read. Using the built-in edition." });
  });

  it("asks for the edition by the id Remote Config names", async () => {
    const fetchRemote = vi.fn(async () => remote);
    await chooseEdition({ ...base, wantId: "byt-newer000001", wantSha: await shaOf(remote), fetchRemote });
    expect(fetchRemote).toHaveBeenCalledWith("byt-newer000001");
  });
});
