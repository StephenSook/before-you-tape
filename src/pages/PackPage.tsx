// The Pack page (plan Task 19): the camera on one side, the box on the other. Each photo is read by the
// route the policy allows, added to the box, and judged by the rules; a country change re-checks the box
// with no model call. Consent is asked once, before any cloud call.
import { useState, useSyncExternalStore } from "react";
import { readItem, ReadFailure, type ReadFailureKind } from "../ai/itemRead";
import type { GateState, ImagePart, ItemModels } from "../ai/port";
import type { openCamera as openCameraFn } from "../capture/camera";
import type { BoxStore } from "../data/boxStore";
import { resolveDestination } from "../engine/edition";
import { chooseReadRoute } from "../routing/policy";
import { BoxSummary } from "../ui/BoxSummary";
import { CameraStage } from "../ui/CameraStage";
import { ConsentNotice } from "../ui/ConsentNotice";
import { DestinationPicker, type DestinationIndexEntry } from "../ui/DestinationPicker";
import { ItemCard } from "../ui/ItemCard";
import { ReadyButton } from "../ui/ReadyButton";

export interface PackConfig {
  killCloud: boolean;
}

export interface PackPageProps {
  store: BoxStore;
  models: ItemModels;
  gate: GateState;
  config: PackConfig;
  openCamera: typeof openCameraFn;
  index: readonly DestinationIndexEntry[];
  saveCrop: (key: string, part: ImagePart, labelText: string) => Promise<void>;
  online: boolean;
  phoneReady?: boolean;
  downloadProgress?: number | null;
  onGetReady?: () => void;
  now?: () => number;
  newCropKey?: () => string;
}

const BLOCKED = "This device can't read photos on its own, and cloud checks are off. Type the item instead.";
const FAILURE: Record<ReadFailureKind, string> = {
  blocked: BLOCKED,
  device_failed: "This laptop couldn't read that one. Try again, or type the item.",
  leak_guard: "That read came back from the cloud when it had to stay on this laptop, so it was thrown away. Try again.",
  cloud_refused: "The cloud check was refused. Try again in a minute, or type the item.",
  cloud_unreachable: "The cloud check could not connect. Check the internet and try again, or type the item.",
  invalid_output: "That read did not make sense. Try again with the label facing the camera.",
};

function countryName(code: string, index: readonly DestinationIndexEntry[]): string {
  const listed = index.find((d) => d.code === code)?.name;
  if (listed) return listed;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function PackPage(p: PackPageProps) {
  const { store, models, gate, config, index } = p;
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const [crops, setCrops] = useState<Record<string, ImagePart>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const edition = store.edition();
  const now = p.now ?? (() => performance.now());
  const newCropKey = p.newCropKey ?? (() => crypto.randomUUID());

  const onImage = async (part: ImagePart) => {
    const route = chooseReadRoute({ gate, cloudConsent: store.getState().cloudConsent, killCloud: config.killCloud, online: p.online });
    if (route === "blocked") { setNotice(BLOCKED); return; }
    setNotice(null);
    try {
      const outcome = await readItem(models, part, route, now);
      const key = newCropKey();
      const itemId = store.addRead(outcome, key);
      setCrops((c) => ({ ...c, [itemId]: part }));
      // The crop and its label text stay on this device; a failure here never loses the verdict.
      await p.saveCrop(key, part, outcome.read.labelText).catch(() => setNotice("The photo could not be kept on this device. The check still counts."));
    } catch (e) {
      setNotice(e instanceof ReadFailure ? FAILURE[e.kind] : "Something went wrong reading that photo. Try again, or type the item.");
    }
  };

  const reviewed = index.filter((d) => resolveDestination(edition, d.code).reviewState === "reviewed").map((d) => d.code);
  const dest = state.result.destination;
  return (
    <div>
      <div className="pack-top">
        <DestinationPicker index={index} reviewed={reviewed} value={state.destinationCode} onChange={(code) => store.setDestination(code)} />
        <ReadyButton gate={gate} progress={p.downloadProgress ?? null} onReady={() => p.onGetReady?.()} />
      </div>
      {state.cloudConsent === null && <ConsentNotice onChoice={(allow) => store.setConsent(allow)} />}
      {config.killCloud && <p data-testid="paused-banner" className="banner" role="status">Cloud checks are paused. Checks on this laptop still work.</p>}
      {dest.suspended && <p data-testid="suspended-banner" className="banner" role="status">Mail service to {countryName(dest.code, index)} is suspended.</p>}
      {notice && <p className="banner" role="alert">{notice}</p>}
      <div className="pack">
        <CameraStage openCamera={p.openCamera} onImage={(part) => void onImage(part)} phoneReady={p.phoneReady} onError={setNotice} />
        <div>
          <BoxSummary result={state.result} itemCount={state.items.length} limits={edition.limits}
            recheck={state.lastRecheckMs === null ? null : { ms: Math.round(state.lastRecheckMs), country: countryName(state.destinationCode, index) }} />
          {state.items.map((item) => {
            const verdict = state.result.items[item.itemId];
            return verdict ? (
              <ItemCard key={item.itemId} item={item} verdict={verdict} crop={crops[item.itemId] ?? null}
                onConfirm={(id) => store.confirmIdentity(id)} onAnswer={(id, q, a) => store.answer(id, q, a)} />
            ) : null;
          })}
        </div>
      </div>
    </div>
  );
}
