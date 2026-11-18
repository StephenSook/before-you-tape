// Builds the Pack page's real parts once: Firebase with App Check, the three item-read models, the box in
// this browser's storage, the bundled rule edition and the destination index. A build without its
// Firebase settings says so plainly instead of breaking.
import { useEffect, useState } from "react";
import bundledEdition from "../../rules/edition.json";
import destinationIndex from "../../rules/destinations/index.json";
import { prepareDeviceModel } from "../ai/deviceModel";
import { createItemModels } from "../ai/firebaseModels";
import { checkGate } from "../ai/gate";
import type { GateState, ItemModels } from "../ai/port";
import { openCamera } from "../capture/camera";
import { CONFIG_DEFAULTS } from "../config/defaults";
import { createBoxStore, type BoxStore } from "../data/boxStore";
import { saveCrop } from "../data/crops";
import { currentBoxId, localPersistence } from "../data/localPersistence";
import { parseEdition } from "../engine/edition";
import { FirebaseConfigError, initFirebase, type FirebaseEnv } from "../firebase/app";
import type { AI } from "firebase/ai";
import { PackPage } from "./PackPage";

interface PackDeps { ai: AI; models: ItemModels; store: BoxStore; lm: unknown }

let built: PackDeps | Error | null = null;

function buildDeps(): PackDeps | Error {
  if (built) return built;
  try {
    const fb = initFirebase(import.meta.env as unknown as FirebaseEnv);
    const ai = fb.getAi(true);
    const lm = (globalThis as { LanguageModel?: unknown }).LanguageModel;
    const edition = parseEdition(bundledEdition);
    const newId = () => crypto.randomUUID();
    const store = createBoxStore({
      edition: () => edition,
      persistence: localPersistence(localStorage),
      now: () => Date.now(),
      // The device's own local calendar date, which counts the rule layers' age (docs/LIMITS.md).
      today: () => new Date().toLocaleDateString("en-CA"),
      newId,
      boxId: currentBoxId(localStorage, newId),
    });
    built = { ai, models: createItemModels(ai, CONFIG_DEFAULTS.cloudModelItem, lm), store, lm };
  } catch (e) {
    built = e instanceof Error ? e : new Error(String(e));
  }
  return built;
}

export function PackRoute() {
  const [deps] = useState(buildDeps);
  const [gate, setGate] = useState<GateState>("no_api");
  const [progress, setProgress] = useState<number | null>(null);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

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
    <PackPage store={deps.store} models={deps.models} gate={gate} config={{ killCloud: CONFIG_DEFAULTS.killCloud }} openCamera={openCamera}
      index={destinationIndex} saveCrop={saveCrop} online={online} downloadProgress={progress} onGetReady={getReady} />
  );
}
