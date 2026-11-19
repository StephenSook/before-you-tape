import { describe, expect, it, vi } from "vitest";
import bundledRaw from "../../rules/edition.json";
import { canonicalJson, parseEdition, sha256Hex } from "../engine/edition";
import { CONFIG_DEFAULTS } from "../config/defaults";
import type { AppConfig, ConfigSource } from "../config/remoteConfig";
import type { RuleEdition } from "../engine/types";
import { chooseEdition, followEditionPin } from "./editionSource";

const bundled = parseEdition(bundledRaw);
const shaOf = (v: unknown) => sha256Hex(canonicalJson(v));
const remote = { ...(bundledRaw as Record<string, unknown>), editionId: "byt-newer000001", revision: (bundled.revision ?? 0) + 1 };

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

  it("keeps the built-in edition when the pinned one is not newer: an older revision, the same, or none", async () => {
    const pinned = (revision: number | undefined) => {
      const { revision: _r, ...rest } = remote;
      void _r;
      return revision === undefined ? rest : { ...rest, revision };
    };
    for (const revision of [undefined, bundled.revision, Math.max(1, (bundled.revision ?? 1) - 1)]) {
      const old = pinned(revision);
      expect(await chooseEdition({ ...base, wantId: "byt-newer000001", wantSha: await shaOf(old), fetchRemote: async () => old }))
        .toMatchObject({ edition: bundled, from: "bundled", notice: "The pinned rule edition is older than this build's. Using the built-in edition." });
    }
  });

  it("keeps a newer edition already in use when a pin is not newer than it, and never falls back to the built-in one", async () => {
    const rev = (bundled.revision ?? 0) + 2;
    const running = parseEdition({ ...remote, editionId: "byt-running00001", revision: rev });
    const pinned = (editionId: string, revision: number) => ({ ...remote, editionId, revision });
    for (const old of [pinned("byt-older0000001", rev - 1), pinned("byt-sameRev00001", rev)]) {
      const got = await chooseEdition({ ...base, active: running, wantId: old.editionId, wantSha: await shaOf(old), fetchRemote: async () => old });
      expect(got).toMatchObject({ edition: running, from: "remote", notice: "The pinned rule edition is older than the one in use. Keeping the one in use." });
    }
    // Clearing the pin is the deliberate way back to the built-in edition.
    expect(await chooseEdition({ ...base, active: running })).toMatchObject({ edition: bundled, from: "bundled", notice: null });
    const newer = pinned("byt-newest000001", rev + 1);
    const got = await chooseEdition({ ...base, active: running, wantId: newer.editionId, wantSha: await shaOf(newer), fetchRemote: async () => newer });
    expect(got.edition.editionId).toBe("byt-newest000001");
  });

  it("asks for the edition by the id Remote Config names", async () => {
    const fetchRemote = vi.fn(async () => remote);
    await chooseEdition({ ...base, wantId: "byt-newer000001", wantSha: await shaOf(remote), fetchRemote });
    expect(fetchRemote).toHaveBeenCalledWith("byt-newer000001");
  });
});

describe("followEditionPin", async () => {
  const bundledSha = await shaOf(bundledRaw);
  const remoteSha = await shaOf(remote);
  // A store that keeps the edition it was switched to, as the box store does.
  const storeWith = (setEdition: (e: RuleEdition) => void, start: RuleEdition = bundled) => {
    let e = start;
    return { edition: () => e, setEdition: (x: RuleEdition) => { e = x; setEdition(x); } };
  };
  const source = (start: Partial<AppConfig>) => {
    let current: AppConfig = { ...CONFIG_DEFAULTS, ...start };
    const listeners = new Set<(c: AppConfig) => void>();
    const s: ConfigSource = { get: () => current, subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); }, ready: Promise.resolve() };
    return { s, push: (c: Partial<AppConfig>) => { current = { ...current, ...c }; for (const l of listeners) l(current); } };
  };

  it("switches the store to a verified edition once config is ready, and to each new pin after", async () => {
    const cfg = source({ rulesEditionId: "byt-newer000001", rulesEditionSha256: remoteSha });
    const setEdition = vi.fn();
    const fetchRemote = vi.fn(async () => remote);
    const onNotice = vi.fn();
    const stop = followEditionPin({ source: cfg.s, store: storeWith(setEdition), bundled, bundledSha, fetchRemote, onNotice });
    await vi.waitFor(() => expect(setEdition).toHaveBeenCalledTimes(1));
    expect(setEdition.mock.calls[0]?.[0].editionId).toBe("byt-newer000001");
    expect(onNotice).toHaveBeenLastCalledWith(null);
    cfg.push({ killCloud: true });
    cfg.push({ rulesEditionId: "", rulesEditionSha256: "" });
    await vi.waitFor(() => expect(setEdition).toHaveBeenCalledTimes(2));
    expect(setEdition.mock.calls[1]?.[0]).toBe(bundled);
    expect(fetchRemote).toHaveBeenCalledTimes(1);
    stop();
  });

  it("does not let a stale pin replace a newer edition the store already switched to", async () => {
    const newest = { ...remote, editionId: "byt-newest000001", revision: (bundled.revision ?? 0) + 2 };
    const cfg = source({ rulesEditionId: newest.editionId, rulesEditionSha256: await shaOf(newest) });
    const setEdition = vi.fn();
    const editions: Record<string, unknown> = { [newest.editionId]: newest, "byt-newer000001": remote };
    followEditionPin({ source: cfg.s, store: storeWith(setEdition), bundled, bundledSha, fetchRemote: async (id) => editions[id] ?? null, onNotice: () => {} });
    await vi.waitFor(() => expect(setEdition).toHaveBeenCalledTimes(1));
    cfg.push({ rulesEditionId: "byt-newer000001", rulesEditionSha256: remoteSha });
    await new Promise((r) => setTimeout(r, 20));
    expect(setEdition).toHaveBeenCalledTimes(1);
    expect(setEdition.mock.calls[0]?.[0].editionId).toBe("byt-newest000001");
  });

  it("applies only the newest pin change, even when an older fetch finishes last", async () => {
    const rev2 = { ...remote, editionId: "byt-rev2xxxxxxx", revision: (bundled.revision ?? 0) + 1 };
    const rev3 = { ...remote, editionId: "byt-rev3xxxxxxx", revision: (bundled.revision ?? 0) + 2 };
    let releaseFirst!: () => void;
    let firstAsk = true;
    const fetchRemote = vi.fn((id: string) => {
      if (id === rev2.editionId && firstAsk) { firstAsk = false; return new Promise<unknown>((r) => { releaseFirst = () => r(rev2); }); }
      return Promise.resolve(id === rev3.editionId ? rev3 : rev2);
    });
    const cfg = source({ rulesEditionId: rev2.editionId, rulesEditionSha256: await shaOf(rev2) });
    const store = storeWith(() => {});
    followEditionPin({ source: cfg.s, store, bundled, bundledSha, fetchRemote, onNotice: () => {} });
    await vi.waitFor(() => expect(fetchRemote).toHaveBeenCalledTimes(1));
    cfg.push({ rulesEditionId: rev3.editionId, rulesEditionSha256: await shaOf(rev3) });
    await vi.waitFor(() => expect(store.edition().editionId).toBe(rev3.editionId));
    cfg.push({ rulesEditionId: rev2.editionId, rulesEditionSha256: await shaOf(rev2) });
    await vi.waitFor(() => expect(fetchRemote).toHaveBeenCalledTimes(3));
    releaseFirst();
    await new Promise((r) => setTimeout(r, 20));
    expect(store.edition().editionId).toBe(rev3.editionId);
  });

  it("starts from the store's edition, so following again after a remount never falls back", async () => {
    const rev3 = parseEdition({ ...remote, editionId: "byt-rev3xxxxxxx", revision: (bundled.revision ?? 0) + 2 });
    const setEdition = vi.fn();
    const cfg = source({ rulesEditionId: "byt-newer000001", rulesEditionSha256: remoteSha });
    followEditionPin({ source: cfg.s, store: storeWith(setEdition, rev3), bundled, bundledSha, fetchRemote: async () => remote, onNotice: () => {} });
    await new Promise((r) => setTimeout(r, 20));
    expect(setEdition).not.toHaveBeenCalled();
  });

  it("keeps the built-in edition and passes on the notice when the pin fails", async () => {
    const cfg = source({ rulesEditionId: "byt-newer000001", rulesEditionSha256: "0".repeat(64) });
    const setEdition = vi.fn();
    const onNotice = vi.fn();
    followEditionPin({ source: cfg.s, store: storeWith(setEdition), bundled, bundledSha, fetchRemote: async () => remote, onNotice });
    await vi.waitFor(() => expect(onNotice).toHaveBeenCalledWith("A newer rule edition failed its integrity check. Using the built-in edition."));
    expect(setEdition).not.toHaveBeenCalled();
  });
});
