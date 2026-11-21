// The Pack page on the app's real parts (src/pages/packDeps.ts) and the destination index. A build without its
// Firebase settings says so plainly instead of breaking.
import { useEffect, useState } from "react";
import destinationIndex from "../../rules/destinations/index.json";
import { prepareDeviceModel } from "../ai/deviceModel";
import { checkGate } from "../ai/gate";
import type { GateState } from "../ai/port";
import { openCamera } from "../capture/camera";
import { sweepCropsWhenOpen } from "../data/cropSweep";
import { deleteCrop, deleteCropsExcept, saveCrop } from "../data/crops";
import { SAMPLE_READ } from "../data/sampleRead";
import { FirebaseConfigError } from "../firebase/app";
import { isPhoneDevice } from "../shared/phoneDevice";
import { LivePack } from "./LivePack";
import { buildDeps } from "./packDeps";

// Read once: whether this is a phone does not change while the page is open.
const PHONE = typeof navigator !== "undefined" && isPhoneDevice(navigator as Navigator & { userAgentData?: { mobile?: boolean } });

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
