// The Pack page (plan Task 19): the camera on one side, the box on the other. Each photo is read by the
// route the policy allows, added to the box, and judged by the rules; a country change re-checks the box
// with no model call. Consent is asked once, before any cloud call. An on-device read the second-look
// policy names is read again in the cloud (plan Task 21), only when the cloud is allowed.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { readItem, ReadFailure, type ReadFailureKind } from "../ai/itemRead";
import { runSecondLook, SECOND_LOOK_TEXT } from "../ai/secondLook";
import type { GateState, ImageHow, ImagePart, ItemModels } from "../ai/port";
import type { openCamera as openCameraFn } from "../capture/camera";
import type { BoxStore } from "../data/boxStore";
import { resolveDestination } from "../engine/edition";
import { deriveFacts } from "../engine/facts";
import { rulesReadBy } from "../engine/layers";
import type { ItemRead } from "../shared/itemRead";
import { isNoItem } from "../shared/noItem";
import { chooseImageRoute, cloudAllowed, needsSecondLook, SECOND_LOOK_DEFAULT, shouldRunSecondLook, type SecondLookPolicy, type SecondLookReason } from "../routing/policy";
import { BoxSummary } from "../ui/BoxSummary";
import { CameraStage } from "../ui/CameraStage";
import { ConsentNotice } from "../ui/ConsentNotice";
import { DestinationPicker, type DestinationIndexEntry } from "../ui/DestinationPicker";
import { AddByHand } from "../ui/AddByHand";
import { ItemCard } from "../ui/ItemCard";
import { ReadyButton } from "../ui/ReadyButton";
import { VerdictChip } from "../ui/VerdictChip";

export interface PackConfig {
  killCloud: boolean;
  // Remote Config has not given the pause yet, so cloud checks are off until it does.
  pauseUnknown?: boolean;
  secondLook?: SecondLookPolicy;
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
  // Why a newer rule edition could not be used, if one was named and failed.
  editionNotice?: string | null;
  // Asks Remote Config again when its settings have not loaded.
  onRetryConfig?: () => void;
  // Remote Config as it changes, so a pause stops reads already running the moment it arrives.
  liveConfig?: { get(): { killCloud: boolean }; subscribe(listener: (c: { killCloud: boolean }) => void): () => void };
}

const BLOCKED = "This device can't read photos on its own, and cloud checks are off. Type the item instead.";

// Why a photo cannot be read right now, in the sender's situation.
function blockedText(i: { cloudConsent: boolean | null; killCloud: boolean; online: boolean }, pauseUnknown = false): string {
  if (!i.online) return "You're offline, and this laptop can't read photos on its own. Type the item, or try again when you're back online.";
  if (i.killCloud && pauseUnknown) return "Cloud checks are waiting for their settings, and this laptop can't read photos on its own. Type the item, or try again in a moment.";
  if (i.killCloud) return "Cloud checks are paused, and this laptop can't read photos on its own. Type the item instead.";
  if (i.cloudConsent === null) return "This laptop can't read photos on its own. Allow cloud checks above, or type the item.";
  return BLOCKED;
}
const situationOf = (i: { cloudConsent: boolean | null; killCloud: boolean; online: boolean }) => `${String(i.cloudConsent)}|${String(i.killCloud)}|${String(i.online)}`;
const FAILURE: Record<ReadFailureKind, string> = {
  blocked: BLOCKED,
  device_failed: "This laptop couldn't read that one. Try again, or type the item.",
  leak_guard: "That read came back from the cloud when it had to stay on this laptop, so it was thrown away. Try again.",
  cloud_refused: "The cloud check was refused. Try again in a minute, or type the item.",
  cloud_unreachable: "The cloud check could not connect. Check the internet and try again, or type the item.",
  invalid_output: "That read did not make sense. Try again with the label facing the camera.",
};

// A read that found no item is dropped, never added as a card.
const NO_ITEM = "Nothing to check there. Hold one item inside the box.";

// A failed second look leaves the device read and its verdict in place.
const SECOND_LOOK_FAILURE: Record<ReadFailureKind, string> = {
  blocked: "Cloud checks are off right now, so this was not checked again.",
  device_failed: "The cloud step did not run. Try again.",
  leak_guard: "The cloud step did not run. Try again.",
  cloud_refused: "The cloud step was refused. Try a normal browser window.",
  cloud_unreachable: "No connection. This check will run when you are back online.",
  invalid_output: "The second look did not make sense. Try again.",
};

interface PendingLook { reason: SecondLookReason; read: ItemRead; part: ImagePart }

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
  const { store, models, gate, config, index, liveConfig } = p;
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const [crops, setCrops] = useState<Record<string, ImagePart>>({});
  const [notice, setNotice] = useState<string | null>(null);
  // Why the last photo could not be read, shown only while that situation still holds.
  const [blocked, setBlocked] = useState<{ text: string; when: string } | null>(null);
  const [typing, setTyping] = useState(false);
  const edition = store.edition();
  const now = p.now ?? (() => performance.now());
  const newCropKey = p.newCropKey ?? (() => crypto.randomUUID());
  const [checking, setChecking] = useState<Record<string, boolean>>({});
  // Items the camera read by itself on this device whose cloud look waits for the sender's press.
  const [offered, setOffered] = useState<Record<string, boolean>>({});
  // What each item needs to be looked at again; kept in memory only, like its crop.
  const looks = useRef(new Map<string, PendingLook>());
  const waitingForOnline = useRef(new Set<string>());

  // The switch and the connection as they are now, for a read that started earlier: before each further
  // cloud call (a retry, the fallback model, a recovery) the read asks whether the cloud is still allowed.
  const live = useRef({ killCloud: config.killCloud, online: p.online });
  useEffect(() => { live.current = { killCloud: config.killCloud, online: p.online }; });
  // The pause as Remote Config has it now. Props and the ref above lag an update until the page renders
  // again, so every decision to use the cloud reads the source itself when there is one.
  const pausedNow = () => (liveConfig ? liveConfig.get().killCloud : live.current.killCloud);
  // Consent is read from this device's record each time (store.consentNow): another tab may have changed it
  // since this page last rendered, and only "allowed" as stored right now opens the cloud.
  const cloudInputs = () => ({ cloudConsent: store.consentNow(), killCloud: liveConfig ? liveConfig.get().killCloud : config.killCloud, online: p.online });
  const stillAllowed = () => !gone.current && cloudAllowed({ cloudConsent: store.consentNow(), killCloud: pausedNow(), online: live.current.online });

  // Reads and second looks that can reach the cloud. Taking back consent or pausing cloud checks aborts
  // them when the change is announced, before the page re-renders; the SDK checks the signal before it
  // gets its tokens and before the request, so it sends nothing it had not already sent.
  // Leaving the page aborts them too, since nothing here hears a later pause; a read that still finishes
  // afterwards adds nothing.
  const inflight = useRef(new Set<AbortController>());
  const gone = useRef(false);
  // A layout cleanup runs while the page is being removed, before any passive one, so a crop handed over
  // during removal already sees the page gone, and the work already started is aborted then.
  useLayoutEffect(() => {
    gone.current = false;
    const work = inflight.current;
    return () => {
      gone.current = true;
      for (const ac of work) ac.abort();
      work.clear();
    };
  }, []);
  useEffect(() => {
    const work = inflight.current;
    const withdraw = () => { for (const ac of work) ac.abort(); work.clear(); };
    const offConsent = store.subscribe(() => { if (store.getState().cloudConsent !== true) withdraw(); });
    const offPause = liveConfig?.subscribe((c) => { if (c.killCloud) withdraw(); });
    return () => { offConsent(); offPause?.(); withdraw(); };
  }, [store, liveConfig]);
  const cloudWork = () => {
    const ac = new AbortController();
    inflight.current.add(ac);
    return { signal: ac.signal, end: () => { inflight.current.delete(ac); } };
  };

  const secondLook = async (itemId: string) => {
    const look = looks.current.get(itemId);
    if (!look) return;
    if (!shouldRunSecondLook(look.reason, cloudInputs())) {
      if (!p.online) { waitingForOnline.current.add(itemId); store.setError(itemId, SECOND_LOOK_FAILURE.cloud_unreachable); }
      else store.setError(itemId, SECOND_LOOK_FAILURE.blocked);
      return;
    }
    setOffered((o) => ({ ...o, [itemId]: false }));
    setChecking((c) => ({ ...c, [itemId]: true }));
    const work = cloudWork();
    try {
      const out = await runSecondLook(models.cloud, look.part, look.read, now, models.fallback, stillAllowed, work.signal);
      if (gone.current) return;
      store.applySecondLook(itemId, out.merged, out.ms, SECOND_LOOK_TEXT[look.reason], out.cloudLabel, out.disputes);
      looks.current.delete(itemId);
    } catch (e) {
      const kind = e instanceof ReadFailure ? e.kind : "cloud_unreachable";
      if (kind === "cloud_unreachable") waitingForOnline.current.add(itemId);
      store.setError(itemId, SECOND_LOOK_FAILURE[kind]);
    } finally {
      work.end();
      setChecking((c) => ({ ...c, [itemId]: false }));
    }
  };

  // Second looks that failed for no connection run again once the page is back online.
  useEffect(() => {
    if (!p.online) return;
    const ids = [...waitingForOnline.current];
    waitingForOnline.current.clear();
    for (const id of ids) void secondLook(id);
    // secondLook reads the latest props through this render; only coming back online should start it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.online]);

  // A frame the camera read by itself stays on this device (or is not read); only a press may use the cloud.
  const onImage = async (part: ImagePart, how: ImageHow) => {
    // A crop that finishes encoding after the sender left starts nothing: no listener here would stop it.
    if (gone.current) return;
    const route = chooseImageRoute(how, { gate, ...cloudInputs() });
    if (route === "skip") return;
    if (route === "blocked") { setNotice(null); setBlocked({ text: blockedText(cloudInputs(), config.pauseUnknown), when: situationOf(cloudInputs()) }); return; }
    setNotice(null);
    setBlocked(null);
    const work = cloudWork();
    try {
      const outcome = await readItem(models, part, route, now, stillAllowed, work.signal);
      if (gone.current) return;
      if (isNoItem(outcome.read)) { setNotice(NO_ITEM); return; }
      const key = newCropKey();
      const itemId = store.addRead(outcome, key);
      setCrops((c) => ({ ...c, [itemId]: part }));
      const added = store.getState().items.find((i) => i.itemId === itemId);
      const reason = added ? needsSecondLook(deriveFacts(added, edition), outcome, config.secondLook ?? SECOND_LOOK_DEFAULT) : null;
      if (reason && shouldRunSecondLook(reason, cloudInputs())) {
        looks.current.set(itemId, { reason, read: outcome.read, part });
        if (how === "steady") setOffered((o) => ({ ...o, [itemId]: true }));
        else void secondLook(itemId);
      }
      // The crop and its label text stay on this device; a failure here never loses the verdict.
      await p.saveCrop(key, part, outcome.read.labelText).catch(() => setNotice("The photo could not be kept on this device. The check still counts."));
    } catch (e) {
      setNotice(e instanceof ReadFailure ? FAILURE[e.kind] : "Something went wrong reading that photo. Try again, or type the item.");
    } finally {
      work.end();
    }
  };

  const newestItem = state.items.at(-1);
  const newestVerdict = newestItem ? state.result.items[newestItem.itemId] : undefined;
  const blockedNow = blocked && blocked.when === situationOf({ cloudConsent: state.cloudConsent, killCloud: config.killCloud, online: p.online }) ? blocked.text : null;
  const readBy = Object.fromEntries(index.flatMap((d) => {
    const r = rulesReadBy(resolveDestination(edition, d.code));
    return r ? [[d.code, r.by] as const] : [];
  }));
  const dest = state.result.destination;
  // The suspension list decides whether anything can go at all, so its check date is always in view.
  const suspensionChecked = `Post office suspension list checked ${edition.suspensions.checkedOn}`;
  return (
    <div className="pack-page">
      <div className="pack-top">
        <DestinationPicker index={index} readBy={readBy} value={state.destinationCode} onChange={(code) => store.setDestination(code)} />
        <p data-testid="suspension-checked">{suspensionChecked}</p>
        <ReadyButton gate={gate} progress={p.downloadProgress ?? null} onReady={() => p.onGetReady?.()} />
      </div>
      {state.cloudConsent === null && <ConsentNotice onChoice={(allow) => store.setConsent(allow)} />}
      {/* The sender can take the cloud choice back at any time; turning it on again shows the notice first. */}
      {state.cloudConsent !== null && (
        <p data-testid="cloud-choice">
          {state.cloudConsent ? "Cloud checks are on." : "Cloud checks are off. Photos and label words stay on this laptop."}{" "}
          <button type="button" onClick={() => store.setConsent(state.cloudConsent ? false : null)}>
            {state.cloudConsent ? "Turn off cloud checks" : "Turn on cloud checks"}
          </button>
        </p>
      )}
      {config.killCloud && (
        <p data-testid="paused-banner" className="banner" role="status">
          {config.pauseUnknown ? "Cloud checks start once their settings load." : "Cloud checks are paused."} Checks on this laptop still work.
          {config.pauseUnknown && p.onRetryConfig && <> <button type="button" onClick={p.onRetryConfig}>Try again</button></>}
        </p>
      )}
      {p.editionNotice && <p data-testid="edition-notice" className="banner" role="status">{p.editionNotice}</p>}
      {dest.suspended && <p data-testid="suspended-banner" className="banner" role="status">Mail service to {countryName(dest.code, index)} is suspended. {suspensionChecked}.</p>}
      {notice && <p className="banner" role="alert">{notice}</p>}
      {blockedNow && <p className="banner" role="alert">{blockedNow}</p>}
      <div className="pack">
        <div>
          <CameraStage openCamera={p.openCamera} onImage={(part, how) => void onImage(part, how)} autoRead={gate === "available"} phoneReady={p.phoneReady} onError={setNotice}
            onTypeIt={() => setTyping(true)} />
          <p><button type="button" aria-expanded={typing} onClick={() => setTyping((t) => !t)}>Type an item</button></p>
          {/* A typed item is the sender's own word, never a model read, so it makes no model call. */}
          {typing && <AddByHand onAdd={(read) => { store.addManual(read); setTyping(false); }} />}
        </div>
        <div>
          <BoxSummary result={state.result} itemCount={state.items.length} limits={edition.limits}
            recheck={state.lastRecheckMs === null ? null : { ms: Math.round(state.lastRecheckMs), country: countryName(state.destinationCode, index) }} />
          {state.items.map((item) => {
            const verdict = state.result.items[item.itemId];
            return verdict ? (
              <ItemCard key={item.itemId} item={item} verdict={verdict} crop={crops[item.itemId] ?? null}
                onConfirm={(id) => store.confirmIdentity(id)} onAnswer={(id, q, a) => store.answer(id, q, a)}
                onFix={(id, patch) => store.override(id, patch)}
                onSettle={(id, field, side) => store.settleDispute(id, field, side)}
                checking={checking[item.itemId] ?? false} error={state.errors[item.itemId]}
                onRetry={(id) => void secondLook(id)}
                onCloudLook={offered[item.itemId] ? (id) => void secondLook(id) : undefined}
                newest={item.itemId === state.items.at(-1)?.itemId} />
            ) : null;
          })}
        </div>
      </div>
      {/* On a phone the newest verdict stays in view in this sheet; the full card is in the list above. */}
      {newestItem && newestVerdict && (
        <div className="newest-sheet" data-testid="newest-sheet" role="status">
          <p className="item-name">{newestItem.overrides.itemName ?? newestItem.read.itemName}</p>
          <VerdictChip level={newestVerdict.level} />
          <a href={`#item-${newestItem.itemId}`}>See the card</a>
        </div>
      )}
    </div>
  );
}
