// Builds the app's real parts once: Firebase with App Check, Remote Config, the item-read models for the model it
// names, the box in Firestore after anonymous sign-in (in this browser's storage if sign-in fails), and the rule
// edition Remote Config pins (the bundled one unless a published one verifies). The Pack page uses them, and
// /judge loads this module only when its live read is pressed.
import type { AI } from "firebase/ai";
import { deleteUser, signOut } from "firebase/auth";
import bundledEdition from "../../rules/edition.json";
import { afterSignIn } from "../ai/authGate";
import { createItemModels } from "../ai/firebaseModels";
import type { ItemModels } from "../ai/port";
import { remoteConfigSource, type ConfigSource } from "../config/remoteConfig";
import { createBoxStore, type BoxStore } from "../data/boxStore";
import { deviceConsent } from "../data/deviceConsent";
import { deviceNames } from "../data/deviceNames";
import { deleteCrop } from "../data/crops";
import { leaveDeletedBox, savedBoxDeleter, whenDeletedElsewhere, type DeleteResult, type DeleteStep } from "../data/deleteSavedBox";
import { firestoreEditionFetcher, followEditionPin } from "../data/editionSource";
import { currentBoxId, localJournal, localPersistence } from "../data/localPersistence";
import { firestorePersistence, persistenceAfterSignIn } from "../data/persistence";
import { canonicalJson, parseEdition, sha256Hex } from "../engine/edition";
import { ensureSignedIn, initFirebase, type FirebaseEnv } from "../firebase/app";
import { localDay } from "../shared/localDay";

export interface PackDeps {
  ai: AI;
  makeModels: (cloudModelItem: string, cloudModelItemFallback: string) => ItemModels;
  source: ConfigSource;
  store: BoxStore;
  lm: unknown;
  followEdition: (onNotice: (notice: string | null) => void) => () => void;
  // Deletes this browser's saved box everywhere it is kept, then its anonymous sign-in.
  // from: where a retry starts, the step that stopped.
  deleteSavedBox: (from?: DeleteStep) => Promise<DeleteResult>;
}

let built: PackDeps | Error | null = null;

export function buildDeps(): PackDeps | Error {
  if (built) return built;
  try {
    const fb = initFirebase(import.meta.env as unknown as FirebaseEnv);
    const ai = fb.getAi(true);
    const lm = (globalThis as { LanguageModel?: unknown }).LanguageModel;
    const edition = parseEdition(bundledEdition);
    const newId = () => crypto.randomUUID();
    const signIn = ensureSignedIn(fb.auth);
    // Saves record the edition in use when they are written, so a switch to a newer edition is kept.
    let store: BoxStore | null = null;
    const editionId = () => (store ?? { edition: () => edition }).edition().editionId;
    const persistence = persistenceAfterSignIn(signIn, (uid) => firestorePersistence(fb.db, uid, editionId), localPersistence(localStorage));
    store = createBoxStore({
      edition: () => edition,
      persistence,
      journal: localJournal(localStorage),
      now: () => Date.now(),
      // The device's own local calendar date, which counts the rule layers' age (docs/LIMITS.md).
      today: () => localDay(),
      newId,
      boxId: currentBoxId(localStorage, newId),
      consent: deviceConsent(localStorage),
      deviceNames: deviceNames(localStorage),
    });
    // One set of models per pair of model names, so a Remote Config change builds them once.
    const byName = new Map<string, ItemModels>();
    const makeModels = (name: string, fallback: string) => {
      const key = `${name}|${fallback}`;
      let m = byName.get(key);
      // Cloud-capable ports wait for anonymous sign-in, so AI Logic can require a signed-in user.
      if (!m) { m = afterSignIn(createItemModels(ai, name, lm, fallback), signIn); byName.set(key, m); }
      return m;
    };
    const source = remoteConfigSource(fb.app);
    // Published editions are readable by signed-in users, so a fetch waits for sign-in.
    const fetchEdition = firestoreEditionFetcher(fb.db);
    const fetchRemote = (id: string) => signIn.then(() => fetchEdition(id));
    const box = store;
    const followEdition = (onNotice: (notice: string | null) => void) => {
      let stop = () => {};
      let alive = true;
      void sha256Hex(canonicalJson(bundledEdition)).then((bundledSha) => {
        if (alive) stop = followEditionPin({ source, store: box, bundled: edition, bundledSha, fetchRemote, onNotice });
      });
      return () => { alive = false; stop(); };
    };
    // For the whole life of the page, not only while the pack page shows: a tab on another page would otherwise miss
    // another tab's delete and come back to the old box.
    const leave = () => { void leaveDeletedBox(box, localStorage, box.getState().boxId, () => window.location.reload()); };
    whenDeletedElsewhere(window, box.getState().boxId, leave);
    const deleteThisBox = savedBoxDeleter({
      store: box,
      signedIn: signIn,
      currentUid: () => fb.auth.currentUser?.uid ?? null,
      deleteFirestoreBox: (uid, id) => firestorePersistence(fb.db, uid, editionId).deleteBox(id),
      deleteCrop,
      storage: localStorage,
      deleteSignIn: async () => { if (fb.auth.currentUser) await deleteUser(fb.auth.currentUser); },
      signOut: () => signOut(fb.auth),
      onStale: leave,
      online: () => navigator.onLine,
    });
    built = { ai, makeModels, source, store: box, lm, followEdition, deleteSavedBox: deleteThisBox };
  } catch (e) {
    built = e instanceof Error ? e : new Error(String(e));
  }
  return built;
}
