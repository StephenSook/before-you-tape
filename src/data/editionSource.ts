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
const OLDER = "The pinned rule edition is older than this build's. Using the built-in edition.";
const OLDER_THAN_IN_USE = "The pinned rule edition is older than the one in use. Keeping the one in use.";

export async function chooseEdition(i: {
  bundled: RuleEdition;
  bundledSha: string;
  wantId: string;
  wantSha: string;
  fetchRemote: (id: string) => Promise<unknown | null>;
  // The edition in use now; a newer verified one may already have replaced the built-in edition.
  active?: RuleEdition;
}): Promise<EditionChoice> {
  // A pin never brings back an edition older than the one in use. Clearing the pin, or naming the built-in
  // edition, is the deliberate way back to it, as a reload would be.
  const running = i.active ?? i.bundled;
  const keep = (notice: string | null): EditionChoice => ({ edition: running, from: running === i.bundled ? "bundled" : "remote", notice });
  const wantId = i.wantId.trim();
  const wantSha = i.wantSha.trim().toLowerCase();
  if (!wantId || (wantId === i.bundled.editionId && wantSha === i.bundledSha)) return { edition: i.bundled, from: "bundled", notice: null };
  if (wantId === running.editionId) return keep(null);

  let raw: unknown;
  try {
    raw = await i.fetchRemote(wantId);
  } catch {
    return keep(NOT_LOADED);
  }
  if (raw === null || raw === undefined) return keep(NOT_LOADED);
  const id = typeof raw === "object" ? (raw as { editionId?: unknown }).editionId : undefined;
  if (id !== wantId || (await sha256Hex(canonicalJson(raw))) !== wantSha) return keep(FAILED_CHECK);
  let edition: RuleEdition;
  try {
    edition = parseEdition(raw);
  } catch {
    return keep(NOT_READ);
  }
  // A pin that is not newer than the rules in use would bring back rules a later edition fixed.
  if ((edition.revision ?? 0) <= (running.revision ?? 0)) return keep(running === i.bundled ? OLDER : OLDER_THAN_IN_USE);
  return { edition, from: "remote", notice: null };
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
// edition and switch the store only when the choice changes. Each pin change is a new request, and only
// the newest one may apply, so a slow, older fetch that finishes last changes nothing. It starts from the
// store's own edition, so following again (a remount) never falls back. Returns a function that stops.
export function followEditionPin(o: {
  source: ConfigSource;
  store: Pick<BoxStore, "setEdition" | "edition">;
  bundled: RuleEdition;
  bundledSha: string;
  fetchRemote: (id: string) => Promise<unknown | null>;
  onNotice: (notice: string | null) => void;
}): () => void {
  let lastPin: string | null = null;
  let request = 0;
  let alive = true;
  const apply = async (c: AppConfig) => {
    const pin = `${c.rulesEditionId}|${c.rulesEditionSha256}`;
    if (pin === lastPin) return;
    lastPin = pin;
    const mine = ++request;
    const choice = await chooseEdition({
      bundled: o.bundled, bundledSha: o.bundledSha, wantId: c.rulesEditionId, wantSha: c.rulesEditionSha256, fetchRemote: o.fetchRemote,
      active: o.store.edition(),
    });
    // A newer pin change may have started while this one was being checked; only the newest applies.
    if (!alive || mine !== request) return;
    if (choice.edition !== o.store.edition()) o.store.setEdition(choice.edition);
    o.onNotice(choice.notice);
  };
  void o.source.ready.then(() => apply(o.source.get()));
  const off = o.source.subscribe((c) => { void apply(c); });
  return () => {
    alive = false;
    off();
  };
}
