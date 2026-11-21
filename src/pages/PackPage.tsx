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
import { longDate } from "../engine/destination";
import { resolveDestination } from "../engine/edition";
import { deriveFacts } from "../engine/facts";
import { rulesReadBy } from "../engine/layers";
import type { ItemRead } from "../shared/itemRead";
import { isNoItem } from "../shared/noItem";
import { READ_TIMEOUT_MS } from "../shared/readLimit";
import { chooseImageRoute, cloudAllowed, needsSecondLook, SECOND_LOOK_DEFAULT, shouldRunSecondLook, type SecondLookPolicy, type SecondLookReason } from "../routing/policy";
import { BoxSummary } from "../ui/BoxSummary";
import { CameraStage } from "../ui/CameraStage";
import { ConsentNotice } from "../ui/ConsentNotice";
import { DestinationPicker, type DestinationIndexEntry } from "../ui/DestinationPicker";
import { AddByHand } from "../ui/AddByHand";
import { ItemCard } from "../ui/ItemCard";
import { ReadyButton } from "../ui/ReadyButton";
import { VerdictChip } from "../ui/VerdictChip";
import manifest from "../../eval/set/manifest.json";

// A tracked eval photo (the /judge sample's body lotion) for a sender with no camera or no item at hand.
const SAMPLE_ITEM = manifest.items.find((i) => i.itemId === "own-18")!;
const SAMPLE_PHOTO = { url: SAMPLE_ITEM.photo, sha256: SAMPLE_ITEM.photoSha256, alt: SAMPLE_ITEM.alt };

export interface PackConfig {
  killCloud: boolean;
  // Remote Config has not given the pause yet, so cloud checks are off until it does.
  pauseUnknown?: boolean;
  secondLook?: SecondLookPolicy;
}

export interface PackPageProps {
  // Loads the sample photo's bytes; the page fetches it from the site when none is given.
  loadSample?: (url: string) => Promise<ArrayBuffer>;
  // The sample photo's recorded read (a real read of it on a laptop's own model, kept in evidence/), shown as
  // recorded when a sender tries the sample, so it always reaches a verdict with no model and no cloud question.
  sampleRead?: { read: ItemRead; ms: number };
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
  // How long a photo added before the cloud settings load waits for them, and how long any one read may take.
  settingsWaitMs?: number;
  readTimeoutMs?: number;
}

// Remote Config usually answers within a second or two of the page opening.
const SETTINGS_WAIT_MS = 10_000;
// A cloud read takes about 2 s and an on-device one under 10 s; anything far past that is not coming back.
const GETTING_READY = "Getting ready to check. One moment.";
const SETTINGS_SLOW = "Cloud checks are still waiting for their settings. Try again in a moment, or type the item.";
const GATE_SLOW = "This laptop is still checking whether it can read photos itself. Try again in a moment, or type the item.";
const CHOICE_CHANGED = "Your cloud choice changed while this laptop was getting ready. Add the photo again.";
const TOO_SLOW = "The check took too long. Try again or type the item.";
const SECOND_LOOK_TOO_SLOW = "The cloud step took too long. Try again.";

// Waits until `pending` reads false, the limit passes or `stop` reads true; says whether `pending` cleared.
async function waitUntilFalse(pending: () => boolean, ms: number, stop: () => boolean): Promise<boolean> {
  const until = Date.now() + ms;
  while (pending() && Date.now() < until && !stop()) await new Promise((r) => setTimeout(r, 50));
  return !pending();
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
  // After a removal: what was removed, said in a live region that stays mounted, and where focus goes next.
  const [removed, setRemoved] = useState("");
  const focusAfterRemove = useRef<string | null>(null);
  const removeItem = (itemId: string) => {
    const at = state.items.findIndex((i) => i.itemId === itemId);
    const removedItem = state.items[at];
    if (!removedItem) return;
    const next = state.items[at + 1] ?? state.items[at - 1];
    focusAfterRemove.current = next ? `item-${next.itemId}` : "box-heading";
    store.remove(itemId);
    // A removed item's photo goes nowhere: its waiting and queued second looks are dropped with it.
    looks.current.delete(itemId);
    waitingForOnline.current.delete(itemId);
    lookAgain.current.delete(itemId);
    // A look already running is stopped: no retry and no fallback model, and what it brings back is dropped.
    lookWork.current.get(itemId)?.();
    setCrops((c) => { const { [itemId]: _gone, ...rest } = c; void _gone; return rest; });
    // Emptied first, so the same words for a second removal are read out again. A newer removal replaces a
    // notice still waiting, and leaving the page clears it.
    const text = `Removed ${removedItem.overrides.itemName ?? removedItem.read.itemName}.`;
    setRemoved("");
    removalNotice.current?.();
    const clear = () => { clearTimeout(id); timers.current.delete(clear); if (removalNotice.current === clear) removalNotice.current = null; };
    const id = setTimeout(() => { clear(); if (!gone.current) setRemoved(text); }, 50);
    timers.current.add(clear);
    removalNotice.current = clear;
  };
  const removalNotice = useRef<(() => void) | null>(null);
  useEffect(() => {
    const target = focusAfterRemove.current;
    if (!target) return;
    focusAfterRemove.current = null;
    document.getElementById(target)?.focus();
  }, [state.items]);
  const edition = store.edition();
  const now = p.now ?? (() => performance.now());
  const newCropKey = p.newCropKey ?? (() => crypto.randomUUID());
  const settingsWaitMs = p.settingsWaitMs ?? SETTINGS_WAIT_MS;
  const readTimeoutMs = p.readTimeoutMs ?? READ_TIMEOUT_MS;
  const [checking, setChecking] = useState<Record<string, boolean>>({});
  // Items the camera read by itself on this device whose cloud look waits for the sender's press.
  const [offered, setOffered] = useState<Record<string, boolean>>({});
  // What each item needs to be looked at again; kept in memory only, like its crop.
  const looks = useRef(new Map<string, PendingLook>());
  const waitingForOnline = useRef(new Set<string>());

  // The switch and the connection as they are now, for a read that started earlier: before each further
  // cloud call (a retry, the fallback model, a recovery) the read asks whether the cloud is still allowed.
  // A press that waited for the settings decides with these, not with the props of the render it started in:
  // the connection, the gate, the models and the second-look policy may all have changed meanwhile.
  const latest = () => ({
    killCloud: config.killCloud, online: p.online, pauseUnknown: config.pauseUnknown === true, gate, models,
    secondLook: config.secondLook ?? SECOND_LOOK_DEFAULT,
  });
  const live = useRef(latest());
  useEffect(() => { live.current = latest(); });
  // How many photos are waiting for the settings; "Getting ready" shows while any is.
  const [waiting, setWaiting] = useState(0);
  // Each press gets a number, so a read that ran out of time does not cover the notice of a newer one.
  const presses = useRef(0);
  // The pause as Remote Config has it now. Props and the ref above lag an update until the page renders
  // again, so every decision to use the cloud reads the source itself when there is one.
  const pausedNow = () => (liveConfig ? liveConfig.get().killCloud : live.current.killCloud);
  // Consent is read from this device's record each time (store.consentNow): another tab may have changed it
  // since this page last rendered, and only "allowed" as stored right now opens the cloud.
  const cloudInputs = () => ({ cloudConsent: store.consentNow(), killCloud: liveConfig ? liveConfig.get().killCloud : config.killCloud, online: p.online });
  const stillAllowed = () => !gone.current && cloudAllowed({ cloudConsent: store.consentNow(), killCloud: pausedNow(), online: live.current.online });
  // The same inputs as they are now, for a decision made after a wait.
  const liveInputs = () => ({ cloudConsent: store.consentNow(), killCloud: pausedNow(), online: live.current.online });

  // Reads and second looks that can reach the cloud. Taking back consent or pausing cloud checks aborts
  // them when the change is announced, before the page re-renders; the SDK checks the signal before it
  // gets its tokens and before the request, so it sends nothing it had not already sent.
  // Leaving the page aborts them too, since nothing here hears a later pause; a read that still finishes
  // afterwards adds nothing.
  const inflight = useRef(new Set<AbortController>());
  const gone = useRef(false);
  // Time limits still running, cleared when the page goes, so none fires for a page that is gone.
  const timers = useRef(new Set<() => void>());
  // A layout cleanup runs while the page is being removed, before any passive one, so a crop handed over
  // during removal already sees the page gone, and the work already started is aborted then.
  useLayoutEffect(() => {
    gone.current = false;
    const work = inflight.current;
    const limits = timers.current;
    return () => {
      gone.current = true;
      for (const ac of work) ac.abort();
      work.clear();
      for (const clear of limits) clear();
      limits.clear();
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
    return { signal: ac.signal, abort: () => ac.abort(), end: () => { inflight.current.delete(ac); } };
  };
  // Stops a piece of work that has run too long: the abort ends any cloud call (the SDK checks the signal),
  // and the caller drops whatever comes back afterwards, an on-device answer included.
  const timeLimit = (ms: number, work: { abort: () => void }, onLate: () => void) => {
    const clear = () => { clearTimeout(id); timers.current.delete(clear); };
    const t = { over: false, clear };
    const id = setTimeout(() => { t.over = true; timers.current.delete(clear); work.abort(); if (!gone.current) onLate(); }, ms);
    timers.current.add(clear);
    return t;
  };
  // Waits until Remote Config has given its settings, the limit passes, the sender takes cloud checks back or
  // the page goes; says whether the settings came. It watches consent itself rather than joining the work a
  // pause aborts, since a "settings still unknown" announcement also says the cloud is off for now.
  const settingsArrive = (ms: number) =>
    waitUntilFalse(() => live.current.pauseUnknown, ms, () => gone.current || store.consentNow() !== true);
  // Second looks running now, one per item. A retry asked for while one runs (a press, or the page coming
  // back online) is kept and runs once the current one ends, if the item still needs it.
  const looking = useRef(new Set<string>());
  const lookAgain = useRef(new Set<string>());
  // How to stop each item's running look, for a removal.
  const lookWork = useRef(new Map<string, () => void>());
  const inBox = (itemId: string) => store.getState().items.some((i) => i.itemId === itemId);

  const secondLook = async (itemId: string) => {
    const look = looks.current.get(itemId);
    if (!look) return;
    // An item removed from the box is never sent to the cloud again.
    if (!inBox(itemId)) { looks.current.delete(itemId); return; }
    if (looking.current.has(itemId)) { lookAgain.current.add(itemId); return; }
    // The inputs as they are now: this may run after a wait or a reconnect, long after the render it closes over.
    if (!shouldRunSecondLook(look.reason, liveInputs())) {
      if (!live.current.online) { waitingForOnline.current.add(itemId); store.setError(itemId, SECOND_LOOK_FAILURE.cloud_unreachable); }
      else store.setError(itemId, SECOND_LOOK_FAILURE.blocked);
      return;
    }
    looking.current.add(itemId);
    setOffered((o) => ({ ...o, [itemId]: false }));
    setChecking((c) => ({ ...c, [itemId]: true }));
    const work = cloudWork();
    lookWork.current.set(itemId, work.abort);
    const limit = timeLimit(readTimeoutMs, work, () => {
      if (looks.current.has(itemId)) store.setError(itemId, SECOND_LOOK_TOO_SLOW);
      setChecking((c) => ({ ...c, [itemId]: false }));
    });
    const { models: m } = live.current;
    try {
      const out = await runSecondLook(m.cloud, look.part, look.read, now, m.fallback, () => stillAllowed() && inBox(itemId), work.signal);
      limit.clear();
      if (gone.current || limit.over || !inBox(itemId)) return;
      store.applySecondLook(itemId, out.merged, out.ms, SECOND_LOOK_TEXT[look.reason], out.cloudLabel, out.disputes);
      looks.current.delete(itemId);
    } catch (e) {
      limit.clear();
      // A look ended by leaving the page, by its time limit, or by removing its item says nothing more.
      if (gone.current || limit.over || !inBox(itemId)) return;
      const kind = e instanceof ReadFailure ? e.kind : "cloud_unreachable";
      if (kind === "cloud_unreachable") waitingForOnline.current.add(itemId);
      store.setError(itemId, SECOND_LOOK_FAILURE[kind]);
    } finally {
      looking.current.delete(itemId);
      lookWork.current.delete(itemId);
      work.end();
      setChecking((c) => ({ ...c, [itemId]: false }));
      if (lookAgain.current.delete(itemId) && !gone.current && looks.current.has(itemId)) void secondLook(itemId);
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

  // The sample photo shows its recorded read: no model runs and the cloud is not asked about.
  const onSampleSend = (part: ImagePart) => {
    if (gone.current || !p.sampleRead) return;
    ++presses.current;
    setNotice(null);
    const key = newCropKey();
    const itemId = store.addRecorded(p.sampleRead.read, p.sampleRead.ms, key);
    setCrops((c) => ({ ...c, [itemId]: part }));
    void p.saveCrop(key, part, p.sampleRead.read.labelText).catch(() => setNotice("The photo could not be kept on this device. The check still counts."));
  };

  // A frame the camera read by itself stays on this device (or is not read); only a press may use the cloud.
  const onImage = async (part: ImagePart, how: ImageHow) => {
    // A crop that finishes encoding after the sender left starts nothing: no listener here would stop it.
    if (gone.current) return;
    // Only a sender's press counts here: a frame the camera read by itself must not hide a press's notice.
    const press = how === "steady" ? null : ++presses.current;
    // The press this read answers to: its own, or for a camera frame the newest one when it started. Its
    // notice shows only while no newer press has come since.
    const owner = press ?? presses.current;
    // Notices and the blocked line after a wait belong to the newest press only: an older one never covers it.
    const say = (text: string | null) => { if (presses.current === owner) setNotice(text); };
    // A press before the page knows whether this laptop has its own model waits for that answer, with a limit,
    // instead of being routed as if there were none: refused with cloud checks off, or sent to the cloud with
    // them on. A camera frame is never read then (it needs the model), so only a press waits.
    // A change to the cloud choice during the wait (off, or off and back on) ends it: the photo is dropped, so
    // it never goes anywhere the sender did not choose at the moment it would be read.
    let waited = false;
    if (press !== null && live.current.gate === "checking") {
      waited = true;
      const consentAtPress = store.consentNow();
      // Every change is caught as it is announced, so turning cloud checks off and straight back on counts too.
      let changed = false;
      const offConsent = store.subscribe(() => { if (store.consentNow() !== consentAtPress) changed = true; });
      setNotice(null);
      setBlocked(null);
      setWaiting((w) => w + 1);
      let known: boolean;
      try {
        known = await waitUntilFalse(() => live.current.gate === "checking", settingsWaitMs, () => gone.current || changed);
      } finally {
        offConsent();
        if (!gone.current) setWaiting((w) => w - 1);
      }
      if (gone.current) return;
      if (changed || store.consentNow() !== consentAtPress) { say(CHOICE_CHANGED); return; }
      if (!known) { say(GATE_SLOW); return; }
    }
    // After a wait, the inputs as they are now (the connection may have changed), not as they were at the press.
    const inputs = waited ? liveInputs : cloudInputs;
    let route = chooseImageRoute(how, { gate: live.current.gate, ...inputs() });
    if (route === "skip") return;
    // A photo added before Remote Config has given its settings (cloud checks stay off until it does) waits
    // for them, with a limit, instead of being turned away by that default and lost when they land a moment
    // later. After the wait it is decided again with the inputs as they are then; if it still cannot be
    // read, the reason stays on screen until the sender acts again.
    if (route === "blocked" && live.current.pauseUnknown && store.consentNow() === true) {
      setNotice(null);
      setBlocked(null);
      setWaiting((w) => w + 1);
      let arrived: boolean;
      try {
        arrived = await settingsArrive(settingsWaitMs);
      } finally {
        if (!gone.current) setWaiting((w) => w - 1);
      }
      if (gone.current) return;
      // Cloud checks taken back during the wait end it, and the notice says that, whatever else holds.
      if (store.consentNow() !== true) { say(blockedText({ ...liveInputs(), killCloud: false, online: true })); return; }
      route = chooseImageRoute(how, { gate: live.current.gate, ...liveInputs() });
      if (route === "skip") return;
      if (route === "blocked") {
        say(!live.current.online ? blockedText(liveInputs()) : arrived ? blockedText(liveInputs(), false) : SETTINGS_SLOW);
        return;
      }
    }
    if (route === "blocked") {
      if (presses.current === owner) { setNotice(null); setBlocked({ text: blockedText(inputs(), live.current.pauseUnknown), when: situationOf(inputs()) }); }
      return;
    }
    // A frame the camera read by itself leaves the notices of the sender's presses in place.
    if (press !== null) {
      setNotice(null);
      setBlocked(null);
    }
    // Registered now, so taking back consent, a pause or leaving the page ends the read.
    const work = cloudWork();
    const limit = timeLimit(readTimeoutMs, work, () => { if (presses.current === owner) setNotice(TOO_SLOW); });
    try {
      const outcome = await readItem(live.current.models, part, route, now, stillAllowed, work.signal);
      limit.clear();
      if (gone.current || limit.over) return;
      if (isNoItem(outcome.read)) { say(NO_ITEM); return; }
      const key = newCropKey();
      const itemId = store.addRead(outcome, key);
      setCrops((c) => ({ ...c, [itemId]: part }));
      const added = store.getState().items.find((i) => i.itemId === itemId);
      const reason = added ? needsSecondLook(deriveFacts(added, edition), outcome, live.current.secondLook) : null;
      if (reason && shouldRunSecondLook(reason, liveInputs())) {
        looks.current.set(itemId, { reason, read: outcome.read, part });
        if (how === "steady") setOffered((o) => ({ ...o, [itemId]: true }));
        else void secondLook(itemId);
      }
      // The crop and its label text stay on this device; a failure here never loses the verdict.
      await p.saveCrop(key, part, outcome.read.labelText).catch(() => setNotice("The photo could not be kept on this device. The check still counts."));
    } catch (e) {
      limit.clear();
      if (gone.current || limit.over) return;
      say(e instanceof ReadFailure ? FAILURE[e.kind] : "Something went wrong reading that photo. Try again, or type the item.");
    } finally {
      work.end();
    }
  };

  const newestItem = state.items.at(-1);
  // Removed items whose delete has not reached the server: their cards are gone, so the page says so.
  const removedUnsaved = (state.unsaved ?? []).filter((id) => !state.items.some((i) => i.itemId === id)).length;
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
      <h1>Check a box before you tape it</h1>
      <p data-testid="purpose" className="purpose">Show each item, and see if it may go in the box to the country you pick.</p>
      <p><a className="judge-link" href="/judge">Judges: start here</a></p>
      <div className="pack-top">
        <DestinationPicker index={index} readBy={readBy} value={state.destinationKnown === false ? "" : state.destinationCode}
          onChange={(code) => store.setDestination(code)} />
        {state.loadState === "failed" && (
          <p role="alert">
            Your saved box could not be opened. New items stay on this device until it opens.{" "}
            <button type="button" onClick={() => void store.retryLoad()}>Try opening it again</button>
          </p>
        )}
        <p data-testid="suspension-checked">{suspensionChecked}</p>
        <ReadyButton gate={gate} progress={p.downloadProgress ?? null} onReady={() => p.onGetReady?.()} cloudOn={state.cloudConsent === true && !config.killCloud} />
      </div>
      {state.cloudConsent === null && <ConsentNotice onChoice={(allow) => store.setConsent(allow)} />}
      {/* The sender can take the cloud choice back at any time; turning it on again shows the notice first. */}
      {state.cloudConsent !== null && (
        <p data-testid="cloud-choice">
          {state.cloudConsent ? "Cloud checks are on." : gate === "checking" ? "Cloud checks are off."
            : gate === "available"
            ? "Cloud checks are off. Photos and label text stay on this laptop."
            : "Cloud checks are off, and this laptop can't read photos on its own. Type items, or turn on cloud checks."}{" "}
          <button type="button" onClick={() => store.setConsent(state.cloudConsent ? false : null)}>
            {state.cloudConsent ? "Turn off cloud checks" : "Turn on cloud checks"}
          </button>
        </p>
      )}
      {config.killCloud && (
        <p data-testid="paused-banner" className="banner" role="status">
          {config.pauseUnknown ? "Cloud checks start once their settings load." : "Cloud checks are paused."}
          {gate === "available" ? " Checks on this laptop still work." : ""}
          {config.pauseUnknown && p.onRetryConfig && <> <button type="button" onClick={p.onRetryConfig}>Try again</button></>}
        </p>
      )}
      {p.editionNotice && <p data-testid="edition-notice" className="banner" role="status">{p.editionNotice}</p>}
      {dest.suspended && <p data-testid="suspended-banner" className="banner" role="status">Mail service to {countryName(dest.code, index)} is suspended. {suspensionChecked}.</p>}
      {!dest.suspended && dest.suspendsFrom && (
        <p data-testid="suspension-ahead-banner" className="banner" role="status">
          The post office stops taking mail to {countryName(dest.code, index)} on {longDate(dest.suspendsFrom)}. Mail this box before then.
        </p>
      )}
      {waiting > 0 && <p data-testid="getting-ready" className="banner" role="status">{GETTING_READY}</p>}
      {notice && <p className="banner" role="alert">{notice}</p>}
      {blockedNow && <p className="banner" role="alert">{blockedNow}</p>}
      <div className="pack">
        <div>
          <CameraStage openCamera={p.openCamera} onImage={(part, how) => void onImage(part, how)} autoRead={gate === "available"} phoneReady={p.phoneReady} onError={setNotice}
            onTypeIt={() => setTyping(true)} sample={SAMPLE_PHOTO} {...(p.loadSample ? { loadSample: p.loadSample } : {})}
            {...(p.sampleRead ? { onSampleSend } : {})} />
          <p><button type="button" aria-expanded={typing} onClick={() => setTyping((t) => !t)}>Type an item</button></p>
          {/* A typed item is the sender's own word, never a model read, so it makes no model call. */}
          {typing && <AddByHand onAdd={(read) => { store.addManual(read); setTyping(false); }} />}
        </div>
        <div>
          <p data-testid="removal-notice" role="status" className="removal-notice">{removed}</p>
          {removedUnsaved > 0 && (
            <p data-testid="removal-unsaved" className="banner" role="alert">
              {removedUnsaved === 1 ? "A removal is not saved yet." : `${removedUnsaved} removals are not saved yet.`}{" "}
              <button type="button" onClick={() => store.retrySave()}>Try saving again</button>
            </p>
          )}
          <BoxSummary result={state.result} itemCount={state.items.length} limits={edition.limits}
            recheck={state.lastRecheckMs === null ? null : { ms: Math.round(state.lastRecheckMs), country: countryName(state.destinationCode, index) }} />
          {state.items.map((item) => {
            const verdict = state.result.items[item.itemId];
            return verdict ? (
              <ItemCard key={item.itemId} item={item} verdict={verdict} crop={crops[item.itemId] ?? null}
                onConfirm={(id) => store.confirmIdentity(id)} onAnswer={(id, q, a) => store.answer(id, q, a)}
                onFix={(id, patch) => store.override(id, patch)}
                onSettle={(id, field, side) => store.settleDispute(id, field, side)}
                unsaved={state.unsaved?.includes(item.itemId) ?? false} onRetrySave={() => store.retrySave()}
                onQuantity={(id, n) => store.setQuantity(id, n)} onRemove={removeItem}
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
