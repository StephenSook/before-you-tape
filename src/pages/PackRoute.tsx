// Builds the Pack page's real parts once: Firebase with App Check, Remote Config, the item-read models for
// the model it names, the box in Firestore after anonymous sign-in (in this browser's storage if sign-in
// fails), the rule edition Remote Config pins (the bundled one unless a published one verifies), and the
// destination index. A build without its Firebase settings says so plainly instead of breaking.
import { SAMPLE_READ } from "../data/sampleRead";
import { isPhoneDevice } from "../shared/phoneDevice";
import { useEffect, useState } from "react";
import bundledEdition from "../../rules/edition.json";
import destinationIndex from "../../rules/destinations/index.json";
import { prepareDeviceModel } from "../ai/deviceModel";
import { afterSignIn } from "../ai/authGate";
import { createItemModels } from "../ai/firebaseModels";
import { checkGate } from "../ai/gate";
import { localDay } from "../shared/localDay";
import type { GateState, ItemModels } from "../ai/port";
import { openCamera } from "../capture/camera";
import { remoteConfigSource, type ConfigSource } from "../config/remoteConfig";
import { createBoxStore, type BoxStore } from "../data/boxStore";
import { firestoreEditionFetcher, followEditionPin } from "../data/editionSource";
import { firestorePersistence, persistenceAfterSignIn } from "../data/persistence";
import { deleteCrop, deleteCropsExcept, saveCrop } from "../data/crops";
import { sweepCropsWhenOpen } from "../data/cropSweep";
import { currentBoxId, localJournal, localPersistence } from "../data/localPersistence";
import { deviceConsent } from "../data/deviceConsent";
import { deviceNames } from "../data/deviceNames";
import { canonicalJson, parseEdition, sha256Hex } from "../engine/edition";
import { ensureSignedIn, FirebaseConfigError, initFirebase, type FirebaseEnv } from "../firebase/app";
import type { AI } from "firebase/ai";
import { LivePack } from "./LivePack";

interface PackDeps {
  ai: AI;
  makeModels: (cloudModelItem: string, cloudModelItemFallback: string) => ItemModels;
  source: ConfigSource;
  store: BoxStore;
  lm: unknown;
  followEdition: (onNotice: (notice: string | null) => void) => () => void;
}

// Read once: whether this is a phone does not change while the page is open.
const PHONE = typeof navigator !== "undefined" && isPhoneDevice(navigator as Navigator & { userAgentData?: { mobile?: boolean } });

let built: PackDeps | Error | null = null;

function buildDeps(): PackDeps | Error {
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
    built = { ai, makeModels, source, store: box, lm, followEdition };
  } catch (e) {
    built = e instanceof Error ? e : new Error(String(e));
  }
  return built;
}

// Unknown until checkGate answers (a few seconds on a cold page); a press meanwhile waits for it.
export const INITIAL_GATE: GateState = "checking";

export function PackRoute() {
  const [deps] = useState(buildDeps);
  const [gate, setGate] = useState<GateState>(INITIAL_GATE);
  const [progress, setProgress] = useState<number | null>(null);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [editionNotice, setEditionNotice] = useState<string | null>(null);

  useEffect(() => (deps instanceof Error ? undefined : deps.followEdition(setEditionNotice)), [deps]);
  // Crops no item in the saved box uses are deleted from this device once it opens.
  useEffect(() => { if (!(deps instanceof Error)) void sweepCropsWhenOpen(deps.store, deleteCropsExcept).catch(() => {}); }, [deps]);

  useEffect(() => {
    if (deps instanceof Error) return;
    let alive = true;
    void checkGate(deps.lm).then((g) => { if (alive) setGate(g); });
    return () => { alive = false; };
  }, [deps]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  if (deps instanceof Error) {
    const text = deps instanceof FirebaseConfigError
      ? "This copy of the site is missing its settings, so it cannot check items."
      : "The checker could not start. Reload the page to try again.";
    return <p role="alert" className="banner">{text}</p>;
  }

  const getReady = () => {
    setGate("downloading");
    setProgress(0);
    void prepareDeviceModel(deps.ai, setProgress)
      .then(() => checkGate(deps.lm))
      .then(setGate, () => checkGate(deps.lm).then(setGate));
  };

  return (
    <LivePack source={deps.source} makeModels={deps.makeModels} store={deps.store} gate={gate} openCamera={openCamera} sampleRead={SAMPLE_READ} phone={PHONE}
      index={destinationIndex} saveCrop={saveCrop} deleteCrop={deleteCrop} online={online} downloadProgress={progress} onGetReady={getReady} editionNotice={editionNotice} />
  );
}
