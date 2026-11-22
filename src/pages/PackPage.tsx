// The Pack page (plan Task 19): the camera on one side, the box on the other. Each photo is read by the
// route the policy allows, added to the box, and judged by the rules; a country change re-checks the box
// with no model call. Consent is asked once, before any cloud call. An on-device read the second-look
// policy names is read again in the cloud (plan Task 21), only when the cloud is allowed.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { readItem, ReadFailure, type ReadFailureKind } from "../ai/itemRead";
import { runSecondLook, SECOND_LOOK_TEXT } from "../ai/secondLook";
import type { GateState, ImageHow, ImagePart, ItemModels } from "../ai/port";
import type { openCamera as openCameraFn } from "../capture/camera";
import type { HolidayDate } from "../config/holidayDates";
import type { BoxStore } from "../data/boxStore";
import type { DeleteResult, DeleteStep, SignInOutcome } from "../data/deleteSavedBox";
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
import { CloudChip } from "../ui/CloudChip";
import { ConsentNotice } from "../ui/ConsentNotice";
import { DeleteBoxPanel } from "../ui/DeleteBoxPanel";
import { DeadlineClock } from "../ui/DeadlineClock";
import { DestinationPicker, type DestinationIndexEntry } from "../ui/DestinationPicker";
import { destinationBadges } from "../ui/destinationBadges";
import { localDay } from "../shared/localDay";
import { AddByHand, savedDraft } from "../ui/AddByHand";
import { ItemCard } from "../ui/ItemCard";
import { ReadyButton } from "../ui/ReadyButton";
import { SecurityCheckFailed } from "../ui/SecurityCheckFailed";
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
  // The USPS holiday mailing dates (holiday_dates_json); none shows no clock.
  holidayDates?: readonly HolidayDate[];
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
  // Deletes a saved crop and its label words from this device.
  deleteCrop: (key: string) => Promise<void>;
  online: boolean;
  phoneReady?: boolean;
  // On a phone: the back camera, and the photo picker opens the camera.
  phone?: boolean;
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
  // The day the suspension badges are for (this device's own day unless a test sets it).
  today?: string;
  // How long the phone's newest-item sheet stays before it goes by itself (it can also be closed).
  newestSheetMs?: number;
  // Deletes the saved box everywhere it is kept; with none, the page offers no delete.
  onDeleteBox?: (from?: DeleteStep) => Promise<DeleteResult>;
  // After a delete: the route starts the page again on a new, empty box.
  afterDelete?: (signIn: SignInOutcome) => void;
  // Shown once after a delete started the page again: how the anonymous sign-in went.
  deletedNotice?: SignInOutcome | null;
  // Reloads the page, for a page older than what the server now accepts (the browser's own reload unless a test sets it).
  onReload?: () => void;
  // How long the cloud settings may be missing before the page says so.
  settingsNoticeMs?: number;
}

// Remote Config usually answers within a second or two of the page opening.
const SETTINGS_WAIT_MS = 10_000;
// So the notice that they are missing waits this long: shown on every load, it moved the whole stage down.
const SETTINGS_NOTICE_MS = 8_000;
// A cloud read takes about 2 s and an on-device one under 10 s; anything far past that is not coming back.
const GETTING_READY = "Getting ready to check. One moment.";
const SETTINGS_SLOW = "Cloud checks are still waiting for their settings. Try again in a moment, or type the item.";
const GATE_SLOW = "This device is still checking whether it can read photos itself. Try again in a moment, or type the item.";
const CHOICE_CHANGED = "Your cloud choice changed while this device was getting ready. Add the photo again.";
const ASK_CHANGED = "Your cloud choice changed in another tab. Add the photo again.";
type AskFor = { kind: "chip" } | { kind: "photo"; part: ImagePart; how: ImageHow } | { kind: "look"; itemId: string };
// at: the choice when the question opened; an answer given after it changed elsewhere is not taken.
type Ask = AskFor & { id: number; at: boolean | null };
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
  if (!i.online) return "You're offline, and this device can't read photos on its own. Type the item, or try again when you're back online.";
  if (i.killCloud && pauseUnknown) return "Cloud checks are waiting for their settings, and this device can't read photos on its own. Type the item, or try again in a moment.";
  if (i.killCloud) return "Cloud checks are paused, and this device can't read photos on its own. Type the item instead.";
  if (i.cloudConsent === null) return "This device can't read photos on its own. Turn on cloud checks, or type the item.";
  return BLOCKED;
}
const situationOf = (i: { cloudConsent: boolean | null; killCloud: boolean; online: boolean }) => `${String(i.cloudConsent)}|${String(i.killCloud)}|${String(i.online)}`;
const FAILURE: Record<ReadFailureKind, string> = {
  blocked: BLOCKED,
  device_failed: "This device couldn't read that one. Try again, or type the item.",
  leak_guard: "That read came back from the cloud when it had to stay on this device, so it was thrown away. Try again.",
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

// nos: how many nos there were when its read began (store.consentNoCount); a newer no keeps the photo here.
interface PendingLook { reason: SecondLookReason; read: ItemRead; part: ImagePart; how?: ImageHow; nos?: number }

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
  // Open when this tab kept an item still being typed (src/ui/AddByHand.tsx), so a reload brings it back in view.
  const [typing, setTyping] = useState(() => savedDraft(store.getState().boxId) !== null);
  // The cloud question, asked when a photo or an offered second look first needs the cloud (and run once the
  // sender answers), or when the sender turns cloud checks on.
  // One question at a time: a newer photo, a removed item or a choice made in another tab closes it.
  const [ask, setAsk] = useState<Ask | null>(null);
  const askIds = useRef(0);
  const openAsk = (a: AskFor) => setAsk({ ...a, id: ++askIds.current, at: store.consentNow() });
  // After a removal: what was removed, said in a live region that stays mounted, and where focus goes next.
  const [removed, setRemoved] = useState("");
  const focusAfterRemove = useRef<string | null>(null);
  // An item's crop and label words stay on this device only while the box holds the item: they are deleted when
  // it leaves, removed here or on another device. A delete that fails is retried when the box next opens.
  const cropOf = useRef(new Map<string, string>());
  useEffect(() => {
    const kept = new Map(state.items.flatMap((i) => (i.cropKey ? [[i.itemId, i.cropKey] as const] : [])));
    for (const [itemId, key] of cropOf.current) if (!kept.has(itemId)) void p.deleteCrop(key).catch(() => {});
    cropOf.current = kept;
  }, [state.items, p]);
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
    waitingForSettings.current.delete(itemId);
    lookAgain.current.delete(itemId);
    // A look already running is stopped: no retry and no fallback model, and what it brings back is dropped.
    lookWork.current.get(itemId)?.();
    setCrops((c) => { const { [itemId]: _gone, ...rest } = c; void _gone; return rest; });
    // Its cloud question goes too: there is no look left to ask about.
    setAsk((a) => (a?.kind === "look" && a.itemId === itemId ? null : a));
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
  // Second looks the rules asked for while cloud checks were off for now (Remote Config's settings not here yet, or
  // kill_cloud on): decided again when cloud checks come on, as when the read landed.
  const waitingForSettings = useRef(new Set<string>());

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
  // Whether the cloud settings have been missing for longer than they usually take to arrive.
  const [settingsLate, setSettingsLate] = useState(false);
  const settingsNoticeMs = p.settingsNoticeMs ?? SETTINGS_NOTICE_MS;
  useEffect(() => {
    setSettingsLate(config.pauseUnknown === true && settingsNoticeMs <= 0);
    if (!config.pauseUnknown || settingsNoticeMs <= 0) return;
    const t = setTimeout(() => setSettingsLate(true), settingsNoticeMs);
    return () => clearTimeout(t);
  }, [config.pauseUnknown, settingsNoticeMs]);
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
    // Taking consent back also drops looks waiting to go back online, so turning cloud checks on again later
    // never sends one by itself.
    const offConsent = store.subscribe(() => {
      // A no drops looks waiting for cloud checks to come on, so a later yes never sends one by itself.
      if (store.getState().cloudConsent === false) waitingForSettings.current.clear();
      if (store.getState().cloudConsent === true) return;
      withdraw();
      const waiting = [...waitingForOnline.current];
      waitingForOnline.current.clear();
      for (const id of waiting) store.setError(id, SECOND_LOOK_FAILURE.blocked);
    });
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

  const afterANo = (look: PendingLook) => look.nos !== undefined && store.consentNoCount() !== look.nos;
  const secondLook = async (itemId: string) => {
    const look = looks.current.get(itemId);
    if (!look) return;
    // Whatever path starts it, a look whose read began before the newest no never goes.
    if (afterANo(look)) { looks.current.delete(itemId); return; }
    // The second-look policy in force now decides, not the one the look was asked under (a retry after being offline
    // can come long after); an item that already has its look gets no other.
    const item = store.getState().items.find((i) => i.itemId === itemId);
    const reasonNow = item && !item.secondLook ? needsSecondLook(deriveFacts(item, edition), { source: "on_device" }, live.current.secondLook) : null;
    if (!reasonNow) { looks.current.delete(itemId); return; }
    look.reason = reasonNow;
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
      // Checked again right before the request: a no given meanwhile, here or in another tab, keeps the photo here.
      const out = await runSecondLook(m.cloud, look.part, look.read, now, m.fallback, () => stillAllowed() && inBox(itemId) && !afterANo(look), work.signal);
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
    // A press like any other: it clears what an older press said, and a late notice of its own never covers a newer one.
    const owner = ++presses.current;
    setNotice(null);
    setBlocked(null);
    const key = newCropKey();
    const itemId = store.addRecorded(p.sampleRead.read, p.sampleRead.ms, key);
    setCrops((c) => ({ ...c, [itemId]: part }));
    void p.saveCrop(key, part, p.sampleRead.read.labelText).catch(() => {
      if (presses.current === owner) setNotice("The photo could not be kept on this device. The check still counts.");
    });
  };

  // A frame the camera read by itself stays on this device (or is not read); only a press may use the cloud.
  // What happens to a look the rules asked for: it runs (offered on the card for a read the camera made by itself),
  // or it is offered to a sender not asked yet; while cloud checks are off for now it waits for them to come on.
  const decideLook = (itemId: string, look: PendingLook) => {
    // The read began before a no, given here or in another tab: its photo stays on this device, whatever was said since.
    if (afterANo(look)) { looks.current.delete(itemId); return; }
    if (shouldRunSecondLook(look.reason, liveInputs())) {
      looks.current.set(itemId, look);
      if (look.how === "steady") setOffered((o) => ({ ...o, [itemId]: true }));
      else void secondLook(itemId);
    } else if (store.consentNow() === null && cloudAllowed({ ...liveInputs(), cloudConsent: true })) {
      // A sender not asked yet is offered the look on the card, and asked when they take it.
      looks.current.set(itemId, look);
      setOffered((o) => ({ ...o, [itemId]: true }));
    } else if (store.consentNow() !== false && (pausedNow() || !live.current.online)) {
      looks.current.set(itemId, look);
      waitingForSettings.current.add(itemId);
    }
  };
  // Cloud checks came on: each waiting look is decided again with the inputs as they are now.
  const redecideLooks = useRef<(seen?: unknown) => void>(() => {});
  // The Remote Config settings this render shows: re-deciding waits for the render of a newer one, so the policy and
  // models used are the ones in force.
  const seenConfig = liveConfig?.get();
  redecideLooks.current = (seen?: unknown) => {
    if (liveConfig && liveConfig.get() !== seen) return;
    if (pausedNow() || !live.current.online) return;
    const waiting = [...waitingForSettings.current];
    waitingForSettings.current.clear();
    for (const id of waiting) {
      const look = looks.current.get(id);
      const item = store.getState().items.find((i) => i.itemId === id);
      // Gone, already looked at, or no longer asked for by the second-look policy in force now: nothing is sent.
      const reason = item && !item.secondLook ? needsSecondLook(deriveFacts(item, edition), { source: "on_device" }, live.current.secondLook) : null;
      if (!look || !reason) { looks.current.delete(id); continue; }
      decideLook(id, { ...look, reason });
    }
  };
  // After the page has rendered a change, so the models, the policy and the connection used are the current ones.
  useEffect(() => { if (!config.killCloud && p.online) redecideLooks.current(seenConfig); }, [config.killCloud, p.online, seenConfig]);
  const onImage = async (part: ImagePart, how: ImageHow) => {
    // A crop that finishes encoding after the sender left starts nothing: no listener here would stop it.
    if (gone.current) return;
    // The answer is read first, so a no another tab recorded earlier is counted before the read, not during it.
    store.consentNow();
    const nosAtRead = store.consentNoCount();
    // Only a sender's press counts here: a frame the camera read by itself must not hide a press's notice.
    const press = how === "steady" ? null : ++presses.current;
    // A newer press closes any open cloud question, so Allow can only send the newest photo.
    if (press !== null) setAsk(null);
    // The press this read answers to: its own, or for a camera frame the newest one when it started. Its
    // notice shows only while no newer press has come since.
    const owner = press ?? presses.current;
    // Notices and the blocked line after a wait belong to the newest press only: an older one never covers it.
    const say = (text: string | null) => { if (presses.current === owner) setNotice(text); };
    // A press before the page knows whether this device has its own model waits for that answer, with a limit,
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
      // Each announced value counts, not only what storage holds now, so an off and an on together still count.
      const offConsent = store.subscribe(() => { if (store.getState().cloudConsent !== consentAtPress || store.consentNow() !== consentAtPress) changed = true; });
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
      // A sender who has not been asked yet is asked now, when only the cloud could read this photo. Settings that
      // have not loaded yet do not stop the question: after Allow, the photo waits for them like any other.
      const askNow = press !== null && store.consentNow() === null
        && chooseImageRoute(how, { gate: live.current.gate, ...inputs(), cloudConsent: true, killCloud: inputs().killCloud && !live.current.pauseUnknown }) !== "blocked";
      if (presses.current === owner) {
        setNotice(null);
        if (askNow) { setBlocked(null); openAsk({ kind: "photo", part, how }); }
        else setBlocked({ text: blockedText(inputs(), live.current.pauseUnknown), when: situationOf(inputs()) });
      }
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
      if (reason) decideLook(itemId, { reason, read: outcome.read, part, how, nos: nosAtRead });
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

  // The answer to the cloud question; a photo that asked goes on to its check (or says why it cannot).
  const answerAsk = (allow: boolean) => {
    const pending = ask;
    askWatch.current?.();
    setAsk(null);
    // Another tab answered first (its storage event may not have arrived): this answer is not taken.
    if (pending && store.consentNow() !== pending.at) {
      if (pending.kind === "photo") setNotice(ASK_CHANGED);
      return;
    }
    store.setConsent(allow);
    // The question's buttons go, so focus returns to the chip that shows the answer.
    document.getElementById("cloud-chip")?.focus();
    if (!pending) return;
    if (pending.kind === "photo") void onImage(pending.part, pending.how);
    else if (pending.kind === "look" && allow) void secondLook(pending.itemId);
  };
  // An offered cloud look asks first when the sender has not been asked yet.
  const takeLook = (itemId: string) => { if (store.consentNow() === null) openAsk({ kind: "look", itemId }); else void secondLook(itemId); };
  // A choice made elsewhere (another tab) while the question is open closes it; a photo it held is dropped.
  const askWatch = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!ask) return;
    const stop = store.subscribe(() => {
      if (store.getState().cloudConsent === ask.at && store.consentNow() === ask.at) return;
      setAsk(null);
      if (ask.kind === "photo") setNotice(ASK_CHANGED);
    });
    askWatch.current = stop;
    return () => { stop(); if (askWatch.current === stop) askWatch.current = null; };
  }, [ask, store]);

  // The box shown is the saved one, or this browser's copy of it: read from the server, or from a cache that held it.
  const knownBox = state.loadState === "ready" && state.readFromCache !== "missing";
  const newestItem = state.items.at(-1);
  // Removed items whose delete has not reached the server: their cards are gone, so the page says so.
  const removedUnsaved = (state.unsaved ?? []).filter((id) => !state.items.some((i) => i.itemId === id)).length;
  const newestVerdict = newestItem ? state.result.items[newestItem.itemId] : undefined;
  // The sheet sits over the bottom of a phone screen, so it goes after a while or when closed; a newer item shows again.
  const [sheetGone, setSheetGone] = useState<string | null>(null);
  const newestId = newestItem?.itemId ?? null;
  useEffect(() => {
    if (newestId === null) return;
    const t = setTimeout(() => setSheetGone(newestId), p.newestSheetMs ?? 8000);
    return () => clearTimeout(t);
  }, [newestId, p.newestSheetMs]);
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
          onChange={(code) => store.setDestination(code)} badges={destinationBadges(edition, index.map((d) => d.code), p.today ?? localDay())} />
        {state.outOfDate && (
          <p data-testid="out-of-date" role="alert">
            Saving stopped because this page is out of date. Reload to keep saving.{" "}
            <button type="button" onClick={() => (p.onReload ?? (() => window.location.reload()))()}>Reload</button>
          </p>
        )}
        {state.unverified && <SecurityCheckFailed onReload={p.onReload} />}
        {/* Another tab changed the box after this one read it; only a reload reads it again. */}
        {state.changedElsewhere && (
          <p data-testid="changed-elsewhere" role="alert">
            This box changed in another tab.{" "}
            <button type="button" onClick={() => (p.onReload ?? (() => window.location.reload()))()}>Reload page</button>
          </p>
        )}
        {/* Read only from this browser's cache: the box stays not whole until a reload reads it from the server. */}
        {state.readFromCache !== undefined && !state.unverified && (
          <p data-testid="cache-only" role="status">
            Showing the copy kept in this browser. Reload once you're online to check the whole box.{" "}
            <button type="button" onClick={() => (p.onReload ?? (() => window.location.reload()))()}>Reload page</button>
          </p>
        )}
        {/* A browser that did not pass the security check is told that instead: the cause, not the symptom. */}
        {state.loadState === "failed" && !state.unverified && (
          <p role="alert">
            Your saved box could not be opened. New items stay on this device until it opens.{" "}
            <button type="button" onClick={() => void store.retryLoad()}>Try opening it again</button>
          </p>
        )}
        <p data-testid="suspension-checked">{suspensionChecked}</p>
        <ReadyButton gate={gate} progress={p.downloadProgress ?? null} onReady={() => p.onGetReady?.()} cloudOn={state.cloudConsent === true && !config.killCloud} />
        {/* The sender can take the cloud choice back at any time; turning it on again asks first. */}
        <CloudChip consent={state.cloudConsent === true} paused={config.killCloud && !config.pauseUnknown}
          onToggle={() => { if (state.cloudConsent === true) store.setConsent(false); else openAsk({ kind: "chip" }); }} />
      </div>
      {config.killCloud && (!config.pauseUnknown || settingsLate) && (
        <p data-testid="paused-banner" className="banner" role="status">
          {config.pauseUnknown ? "Cloud checks start once their settings load." : "Cloud checks are paused."}
          {gate === "available" ? " Checks on this device still work." : ""}
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
      <DeadlineClock dates={config.holidayDates ?? []} now={p.today ? new Date(`${p.today}T12:00:00`) : new Date()}
        destination={{ name: countryName(dest.code, index), suspended: dest.suspended, suspendsFrom: dest.suspendsFrom ?? null }} />
      {waiting > 0 && <p data-testid="getting-ready" className="banner" role="status">{GETTING_READY}</p>}
      {notice && <p className="banner" role="alert">{notice}</p>}
      {blockedNow && <p className="banner" role="alert">{blockedNow}</p>}
      {p.deletedNotice && (
        <p data-testid="box-deleted" className="banner" role="status">
          Your saved box is deleted.
          {p.deletedNotice === "signed_out"
            ? " Your anonymous sign-in could not be deleted right away; Firebase may delete it automatically any time after it is 30 days old."
            : p.deletedNotice === "deleted" ? " So is your anonymous sign-in." : ""}
        </p>
      )}
      {ask && <ConsentNotice key={ask.id} onChoice={answerAsk} />}
      <div className="pack">
        <div>
          <CameraStage openCamera={p.openCamera} onImage={(part, how) => void onImage(part, how)} autoRead={gate === "available"} phoneReady={p.phoneReady} {...(p.phone ? { phone: true } : {})} onError={setNotice}
            onTypeIt={() => setTyping(true)} onPress={() => setAsk(null)} sample={SAMPLE_PHOTO} {...(p.loadSample ? { loadSample: p.loadSample } : {})}
            {...(p.sampleRead ? { onSampleSend } : {})} />
          <p><button type="button" aria-expanded={typing} onClick={() => setTyping((t) => !t)}>Type an item</button></p>
          {/* A typed item is the sender's own word, never a model read, so it makes no model call. */}
          {typing && <AddByHand boxId={state.boxId} onAdd={(read) => {
            // A typed item is a press like any other: an older read's failure alert no longer applies once it is in.
            ++presses.current;
            setNotice(null);
            setBlocked(null);
            store.addManual(read);
            setTyping(false);
          }} />}
        </div>
        <div>
          <p data-testid="removal-notice" role="status" className="removal-notice">{removed}</p>
          {removedUnsaved > 0 && (
            <p data-testid="removal-unsaved" className="banner" role="alert">
              {removedUnsaved === 1 ? "A removal is not saved yet." : `${removedUnsaved} removals are not saved yet.`}{" "}
              {!state.outOfDate && <button type="button" onClick={() => store.retrySave()}>Try saving again</button>}
            </p>
          )}
          {/* Nothing syncs while App Check refuses this browser, so the box never reads as the saved one, or as new. */}
          {state.unverified && (
            <p data-testid="not-synced" className="banner" role="status">
              {state.cachedCopy ? "Not synced: below is the copy of your box kept in this browser."
                : knownBox ? "Not synced: you're seeing the copy kept in this browser."
                : "Not synced: your saved box can't be shown until this browser passes the security check."}
            </p>
          )}
          <BoxSummary result={state.result} itemCount={state.items.length} limits={edition.limits} unknownBox={state.unverified === true && !knownBox} incomplete={state.incomplete === true}
            recheck={state.lastRecheckMs === null ? null : { ms: Math.round(state.lastRecheckMs), country: countryName(state.destinationCode, index) }} />
          {state.items.map((item) => {
            const verdict = state.result.items[item.itemId];
            return verdict ? (
              <ItemCard key={item.itemId} item={item} verdict={verdict} crop={crops[item.itemId] ?? null}
                onConfirm={(id) => store.confirmIdentity(id)} onAnswer={(id, q, a) => store.answer(id, q, a)}
                onFix={(id, patch) => store.override(id, patch)}
                onConfirmNumber={(id, field, value) => store.confirmLabelNumber(id, field, value)}
                onSettle={(id, field, side) => store.settleDispute(id, field, side)}
                unsaved={state.unsaved?.includes(item.itemId) ?? false} onRetrySave={state.outOfDate ? undefined : () => store.retrySave()}
                onQuantity={(id, n) => store.setQuantity(id, n)} onRemove={removeItem}
                checking={checking[item.itemId] ?? false} error={state.errors[item.itemId]}
                onRetry={(id) => void secondLook(id)}
                onCloudLook={offered[item.itemId] && state.cloudConsent !== false ? takeLook : undefined}
                newest={item.itemId === state.items.at(-1)?.itemId} />
            ) : null;
          })}
          {state.cachedCopy && (
            <section data-testid="cached-copy" aria-labelledby="cached-copy-heading" className="cached-copy">
              <h3 id="cached-copy-heading">Kept in this browser, for {countryName(state.cachedCopy.destinationCode, index)}</h3>
              <ul>
                {state.cachedCopy.items.map((i) => {
                  const v = state.cachedCopy?.result.items[i.itemId];
                  return <li key={i.itemId}>{i.overrides.itemName ?? i.read.itemName} {v && <VerdictChip level={v.level} />}</li>;
                })}
              </ul>
            </section>
          )}
          {p.onDeleteBox && state.loadState === "ready" && !state.unverified && (
            <DeleteBoxPanel onDelete={p.onDeleteBox} onDone={(signIn) => p.afterDelete?.(signIn)} />
          )}
        </div>
      </div>
      {/* On a phone the newest verdict stays in view in this sheet; the full card is in the list above. */}
      {newestItem && newestVerdict && sheetGone !== newestItem.itemId && (
        <div className="newest-sheet" data-testid="newest-sheet" role="status">
          <p className="item-name">{newestItem.overrides.itemName ?? newestItem.read.itemName}</p>
          <VerdictChip level={newestVerdict.level} />
          <a href={`#item-${newestItem.itemId}`}>See the card</a>
          <button type="button" className="sheet-close" aria-label="Close" onClick={() => setSheetGone(newestItem.itemId)}>×</button>
        </div>
      )}
    </div>
  );
}
