// The shared edition-choice vectors (tests/vectors/editionChoice.json): which rule edition an app uses for a pin,
// and whether it says so. The phone apps run the same file against their own edition choice.
// Each case: inUse is "builtIn" or { revision } (a verified pinned edition already in use, its revision as an
// offset from the built-in edition's); pin is "none", "builtIn" (its id and hash), "builtInIdWrongSha", "inUse", or
// { revision, doc } (a pinned edition, revision as an offset or null for none, and how its document comes back: ok,
// missing, fetchFails, wrongHash, wrongId or unreadable); expect.use is builtIn, inUse or pin; expect.notice is null
// or a notice kind; expect.fetched says whether the pinned document was asked for at all.
import { describe, expect, it } from "vitest";
import bundledRaw from "../../rules/edition.json";
import vectors from "../../tests/vectors/editionChoice.json";
import { canonicalJson, parseEdition, sha256Hex } from "../engine/edition";
import { chooseEdition } from "./editionSource";

type Offset = number | null;
interface ChoiceVector {
  name: string;
  inUse: "builtIn" | { revision: number };
  pin: "none" | "builtIn" | "builtInIdWrongSha" | "inUse" | { revision: Offset; doc: "ok" | "missing" | "fetchFails" | "wrongHash" | "wrongId" | "unreadable" };
  expect: { use: "builtIn" | "inUse" | "pin"; notice: null | "notLoaded" | "failedCheck" | "notRead" | "olderThanInUse"; fetched: boolean };
}

const NOTICES = {
  notLoaded: "A newer rule edition could not be loaded. Using the built-in edition.",
  failedCheck: "A newer rule edition failed its integrity check. Using the built-in edition.",
  notRead: "A newer rule edition could not be read. Using the built-in edition.",
  olderThanInUse: "The pinned rule edition is older than the one in use. Keeping the one in use.",
} as const;

const bundled = parseEdition(bundledRaw);
const shaOf = (v: unknown) => sha256Hex(canonicalJson(v));
const PIN_ID = "byt-vectorpin01";
const USE_ID = "byt-vectoruse01";
// The built-in edition's rules under another id, with its revision moved by an offset (null: no revision at all).
const editionDoc = (id: string, offset: Offset): Record<string, unknown> => {
  const { revision: _r, ...rest } = bundledRaw as Record<string, unknown>;
  void _r;
  return offset === null ? { ...rest, editionId: id } : { ...rest, editionId: id, revision: (bundled.revision ?? 0) + offset };
};

describe("edition choice", () => {
  it("gives every shared edition-choice vector its edition and notice", async () => {
    const bundledSha = await shaOf(bundledRaw);
    expect((vectors as ChoiceVector[]).length).toBeGreaterThanOrEqual(16);
    for (const v of vectors as ChoiceVector[]) {
      const useDoc = v.inUse === "builtIn" ? null : editionDoc(USE_ID, v.inUse.revision);
      const active = useDoc ? parseEdition(useDoc) : undefined;
      let wantId = "";
      let wantSha = "";
      let fetchRemote: (id: string) => Promise<unknown | null> = async () => null;
      if (v.pin === "builtIn") { wantId = bundled.editionId; wantSha = bundledSha; }
      else if (v.pin === "builtInIdWrongSha") { wantId = bundled.editionId; wantSha = "0".repeat(64); fetchRemote = async () => bundledRaw; }
      else if (v.pin === "inUse") { wantId = USE_ID; wantSha = await shaOf(useDoc); fetchRemote = async () => useDoc; }
      else if (v.pin !== "none") {
        const doc = editionDoc(PIN_ID, v.pin.revision);
        const served = v.pin.doc === "wrongId" ? { ...doc, editionId: "byt-vectorother" }
          : v.pin.doc === "unreadable" ? { editionId: PIN_ID, revision: 99 } : doc;
        wantId = PIN_ID;
        wantSha = v.pin.doc === "wrongHash" ? "0".repeat(64) : await shaOf(served);
        const kind = v.pin.doc;
        fetchRemote = async () => {
          if (kind === "fetchFails") throw new Error("offline");
          return kind === "missing" ? null : served;
        };
      }
      let fetched = false;
      const fetchOnce = fetchRemote;
      const got = await chooseEdition({ bundled, bundledSha, wantId, wantSha, ...(active ? { active } : {}),
        fetchRemote: (id) => { fetched = true; return fetchOnce(id); } });
      expect(fetched, `${v.name} fetched`).toBe(v.expect.fetched);
      const usedId = v.expect.use === "builtIn" ? bundled.editionId : v.expect.use === "inUse" ? USE_ID : PIN_ID;
      expect(got.edition.editionId, v.name).toBe(usedId);
      expect(got.notice, v.name).toBe(v.expect.notice === null ? null : NOTICES[v.expect.notice]);
    }
  });
});
