// Which rule edition the app uses. The built-in edition ships with the build; Remote Config can name a
// newer one by id and SHA-256, and it is used only when the fetched document has exactly that id and hash
// and parses. Anything else keeps the built-in edition and says so.
import { doc, getDoc, type Firestore } from "firebase/firestore";
import { canonicalJson, parseEdition, sha256Hex } from "../engine/edition";
import type { AppConfig, ConfigSource } from "../config/remoteConfig";
import type { RuleEdition } from "../engine/types";
import type { BoxStore } from "./boxStore";

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

// A published edition lives at ruleEditions/{id} as { json, sha256 }, where json is the edition's canonical
// JSON text, so Firestore's own types can never change the bytes the hash covers. Missing or malformed: null.
export function firestoreEditionFetcher(db: Firestore): (id: string) => Promise<unknown | null> {
  return async (id) => {
    const snap = await getDoc(doc(db, "ruleEditions", id));
    if (!snap.exists()) return null;
    const json = (snap.data() as { json?: unknown }).json;
    if (typeof json !== "string") return null;
    try {
      return JSON.parse(json) as unknown;
    } catch {
      return null;
    }
  };
}

// Follows the Remote Config edition pin: once config is ready, and whenever the pin changes, choose the
// edition and switch the store only when the choice changes. Returns a function that stops following.
export function followEditionPin(o: {
  source: ConfigSource;
  store: Pick<BoxStore, "setEdition">;
  bundled: RuleEdition;
  bundledSha: string;
  fetchRemote: (id: string) => Promise<unknown | null>;
  onNotice: (notice: string | null) => void;
}): () => void {
  let lastPin: string | null = null;
  let current = o.bundled;
  let alive = true;
  const apply = async (c: AppConfig) => {
    const pin = `${c.rulesEditionId}|${c.rulesEditionSha256}`;
    if (pin === lastPin) return;
    lastPin = pin;
    const choice = await chooseEdition({ bundled: o.bundled, bundledSha: o.bundledSha, wantId: c.rulesEditionId, wantSha: c.rulesEditionSha256, fetchRemote: o.fetchRemote });
    // A newer pin may have arrived while this one was being checked; only the latest counts.
    if (!alive || pin !== lastPin) return;
    if (choice.edition !== current) {
      current = choice.edition;
      o.store.setEdition(choice.edition);
    }
    o.onNotice(choice.notice);
  };
  void o.source.ready.then(() => apply(o.source.get()));
  const off = o.source.subscribe((c) => { void apply(c); });
  return () => {
    alive = false;
    off();
  };
}
