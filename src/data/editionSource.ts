// Which rule edition the app uses. The built-in edition ships with the build; Remote Config can name a
// newer one by id and SHA-256, and it is used only when the fetched document has exactly that id and hash
// and parses. Anything else keeps the built-in edition and says so.
import { canonicalJson, parseEdition, sha256Hex } from "../engine/edition";
import type { RuleEdition } from "../engine/types";

export interface EditionChoice { edition: RuleEdition; from: "bundled" | "remote"; notice: string | null }

const NOT_LOADED = "A newer rule edition could not be loaded. Using the built-in edition.";
const FAILED_CHECK = "A newer rule edition failed its integrity check. Using the built-in edition.";
const NOT_READ = "A newer rule edition could not be read. Using the built-in edition.";

export async function chooseEdition(i: {
  bundled: RuleEdition;
  bundledSha: string;
  wantId: string;
  wantSha: string;
  fetchRemote: (id: string) => Promise<unknown | null>;
}): Promise<EditionChoice> {
  const keep = (notice: string | null): EditionChoice => ({ edition: i.bundled, from: "bundled", notice });
  const wantId = i.wantId.trim();
  const wantSha = i.wantSha.trim().toLowerCase();
  if (!wantId || (wantId === i.bundled.editionId && wantSha === i.bundledSha)) return keep(null);

  let raw: unknown;
  try {
    raw = await i.fetchRemote(wantId);
  } catch {
    return keep(NOT_LOADED);
  }
  if (raw === null || raw === undefined) return keep(NOT_LOADED);
  const id = typeof raw === "object" ? (raw as { editionId?: unknown }).editionId : undefined;
  if (id !== wantId || (await sha256Hex(canonicalJson(raw))) !== wantSha) return keep(FAILED_CHECK);
  try {
    return { edition: parseEdition(raw), from: "remote", notice: null };
  } catch {
    return keep(NOT_READ);
  }
}
