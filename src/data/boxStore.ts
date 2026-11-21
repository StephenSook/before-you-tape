// The box: local-first, with verdicts always derived (plan Task 18). Every change re-runs evaluateBox, so
// a verdict is never read back from storage. Label text stays in memory and with the crop on this device;
// the copy handed to persistence carries only the tags found in it.
import { CATEGORY_LABELS } from "../ui/categoryLabels";
import type { FallbackAfter, ReadOutcome } from "../ai/itemRead";
import type { InferenceSourceName, ReadRoute } from "../ai/port";
import { resolveDestination } from "../engine/edition";
import { LABEL_TEXT_TAG, labelTagsOf } from "../engine/facts";
import {
  DISPUTE_FIELDS, type BoxItemInput, type DestinationEdition, type DisputeField, type DisputeValues, type ReadDisputes, type RuleEdition,
} from "../engine/types";
import { evaluateBox, type BoxResult } from "../engine/verdict";
import { LABEL_TEXT_MAX, type ItemRead } from "../shared/itemRead";
import { stableJson, type BoxMeta, type BoxOps } from "./boxOps";
import type { DeviceConsent } from "./deviceConsent";

// Where an item's read came from. The phones use one name each for both of them.
// cloud_unreported: the SDK named no route, so it counts as cloud and the card says so.
// sample_recorded: the sample photo's read, recorded earlier on a laptop's own model and shown as recorded, so a
// sender with no model and no cloud still sees a verdict; it is never counted as a read made here.
export type ReadSource = InferenceSourceName | "cloud_unreported" | "manual" | "phone_on_device" | "phone_cloud" | "sample_recorded";

export interface CustomsLine {
  description: string;
  lintOk: boolean;
  weightOz: number | null;
  valueUsd: number | null;
  countryOfOrigin: string | null;
  upc: string | null;
}

export interface BoxItem extends BoxItemInput {
  readSource: ReadSource;
  readMs: number;
  secondLook: { ms: number; reason: string } | null;
  // Set only when the fallback cloud model made the read, with the status that sent it there.
  readFallback?: { after: FallbackAfter; route: ReadRoute };
  cropKey: string | null;
  customs: CustomsLine;
  // When the item was added, in milliseconds since 1970 on the adding device; orders the box after a reload.
  addedAt?: number;
}

export interface BoxSources { onDevice: number; inCloud: number; secondLooks: number; rulesOnlyRechecks: number; cloudFallbacks: number }

const NO_SOURCES: BoxSources = { onDevice: 0, inCloud: 0, secondLooks: 0, rulesOnlyRechecks: 0, cloudFallbacks: 0 };

export interface BoxState {
  boxId: string;
  destinationCode: string;
  items: BoxItem[];
  result: BoxResult;
  cloudConsent: boolean | null;
  sources: BoxSources;
  lastRecheckMs: number | null;
  errors: Record<string, string>;
  // Items with an edit that has not reached the server: what the card shows is on this device only.
  unsaved?: readonly string[];
  // Whether the saved box has been read: until it has, nothing is written; a read that failed writes nothing.
  loadState?: "loading" | "ready" | "failed";
  // Whether the country is known: the saved box has been read, or the sender chose one. Until then the picker
  // shows no country, so even a first pick of the default counts.
  destinationKnown?: boolean;
}

// Edits not yet acknowledged by the server: each item's latest stored copy (null: removed) and the box's
// details. Kept in this browser, so a reload sends them.
export interface Journal { meta: BoxMeta | null; items: Record<string, BoxItem | null> }
export interface JournalStore {
  read(boxId: string): Journal | null;
  write(boxId: string, journal: Journal): void;
}

// An item's own names, the read's and the sender's correction, kept on this device: the server has only
// the label of the item's category.
export interface ItemNames { read: string; override?: string }
export interface DeviceNames {
  remember(boxId: string, names: Record<string, ItemNames>): void;
  recall(boxId: string): Record<string, ItemNames>;
}

export interface BoxStore {
  ready: Promise<void>;
  getState(): BoxState;
  // The edition the verdicts come from, for its limits and its reviewed countries.
  edition(): RuleEdition;
  // Switch to another edition (a verified newer one) and judge the box again with it.
  setEdition(e: RuleEdition): void;
  subscribe(listener: (s: BoxState) => void): () => void;
  addRead(outcome: ReadOutcome, cropKey: string): string;
  addManual(read: ItemRead): string;
  // The sample photo's recorded read: judged like any read, but counted as no read made on this device.
  addRecorded(read: ItemRead, ms: number, cropKey: string): string;
  mergeRemoteItem(item: BoxItem): void;
  confirmIdentity(itemId: string): void;
  // cloudLabel: the second look's own label text, whose tags count even when the merge kept the other label.
  // disputes: the facts the two reads disagreed on (readDisputes); the store adds label words itself.
  applySecondLook(itemId: string, merged: ItemRead, ms: number, reason: string, cloudLabel?: string, disputes?: ReadDisputes): void;
  // The sender picks which read is right about one disputed fact; that reading is then the item's.
  settleDispute(itemId: string, field: DisputeField, side: "device" | "cloud"): void;
  setError(itemId: string, text: string): void;
  answer(itemId: string, questionId: string, answerId: string): void;
  override(itemId: string, patch: Partial<ItemRead>): void;
  setQuantity(itemId: string, n: number): void;
  setCustoms(itemId: string, patch: Partial<CustomsLine>): void;
  remove(itemId: string): void;
  setDestination(code: string): void;
  setLiveRead(code: string, edition: DestinationEdition): void;
  setConsent(v: boolean | null): void;
  // Sends again every edit that has not reached the server.
  retrySave(): void;
  // Reads the saved box again, after a read that failed.
  retryLoad(): Promise<void>;
  // Resolves once the box has been read and every write started so far has answered (tests, leaving the page).
  settled(): Promise<void>;
  // Before the box is deleted: no edit is kept or sent from now on (the page still shows it), and this resolves once
  // the writes already out have answered, so none of them can land after the delete.
  close(): Promise<void>;
  // After a delete that failed with the box still there: keeps and sends again, the edits made while closed too.
  reopen(): void;
  // This device's answer as stored now, read fresh: right before a cloud call it may differ from the state
  // a page last rendered, if another tab changed it.
  consentNow(): boolean | null;
}

export interface BoxStoreDeps {
  edition: () => RuleEdition;
  // Where the box is saved: explicit operations, each changing only what it names.
  persistence: BoxOps;
  // This browser's copy of the edits not yet saved. Without it they last for this page only.
  journal?: JournalStore;
  now: () => number;
  // The device's own local calendar date, YYYY-MM-DD.
  today: () => string;
  newId: () => string;
  boxId?: string;
  // Wall-clock time for addedAt; now() is only for measuring how long things take.
  clock?: () => number;
  // This device's own cloud answer, shared by its tabs and never synced. Without it the answer lasts for
  // this page only.
  consent?: DeviceConsent;
  deviceNames?: DeviceNames;
}

// A new box starts in the Philippines: Canada's mail is suspended from 2026-11-29 (rules/suspensions.json).
const DEFAULT_DESTINATION = "PH";

// Items in the order they were added. The server returns them by id, which is random; an item saved before
// addedAt existed keeps its place after the dated ones.
export function inAddedOrder(items: readonly BoxItem[]): BoxItem[] {
  return items.map((item, i) => ({ item, i }))
    .sort((a, b) => (a.item.addedAt ?? Infinity) - (b.item.addedAt ?? Infinity) || a.i - b.i)
    .map((x) => x.item);
}
const EMPTY_CUSTOMS: CustomsLine = { description: "", lintOk: false, weightOz: null, valueUsd: null, countryOfOrigin: null, upc: null };

const clampQuantity = (n: number) => (Number.isFinite(n) ? Math.min(99, Math.max(1, Math.round(n))) : 1);

// The copy that leaves memory: no label text, read or corrected; the tags stand in for it.
// Firestore never gets an item's own name: the model's can repeat the label's words, and the sender's are
// theirs. It gets the label of the item's category (the corrected one, if the sender changed it); the real
// names stay on this device.
function forStorage(item: BoxItem): BoxItem {
  const { labelText: _text, itemName: _name, ...overrides } = item.overrides;
  void _text;
  void _name;
  const category = item.overrides.category ?? item.read.category;
  return { ...item, read: { ...item.read, labelText: "", itemName: CATEGORY_LABELS[category] }, overrides };
}

// Whether a sender's correction covers a disputed fact: their own word settles it. Battery numbers are one
// fact: only a whole corrected set (all three numbers) settles them, never one edited number.
const corrects = (patch: Partial<ItemRead>, field: DisputeField): boolean =>
  field === "battery" ? patch.volts !== undefined && patch.milliampHours !== undefined && patch.wattHours !== undefined
  : field === "labelTags" ? patch.labelText !== undefined
  : patch[field] !== undefined;

// The label words that can change a verdict: every tag except the one that only says a label was read.
const wordsOf = (tags: readonly string[]) => [...new Set(tags.filter((t) => t !== LABEL_TEXT_TAG))].sort().join(",");

const withDisputes = (item: BoxItem, disputes: ReadDisputes): BoxItem => {
  const { disputes: _old, ...rest } = item;
  void _old;
  return Object.keys(disputes).length > 0 ? { ...rest, disputes } : rest;
};

const namesOf = (item: BoxItem): ItemNames =>
  item.overrides.itemName === undefined ? { read: item.read.itemName } : { read: item.read.itemName, override: item.overrides.itemName };

export function createBoxStore(deps: BoxStoreDeps): BoxStore {
  let items: BoxItem[] = [];
  let switchedTo: RuleEdition | null = null;
  const currentEdition = () => switchedTo ?? deps.edition();
  let destinationCode = DEFAULT_DESTINATION;
  let liveRead: { code: string; edition: DestinationEdition } | null = null;
  let cloudConsent: boolean | null = deps.consent?.get() ?? null;
  let sources: BoxSources = { ...NO_SOURCES };
  let lastRecheckMs: number | null = null;
  const clock = deps.clock ?? (() => Date.now());
  let errors: Record<string, string> = {};
  const boxId = deps.boxId ?? deps.newId();
  const listeners = new Set<(s: BoxState) => void>();
  // Each second look's two label texts and item names, kept on this device only, so picking a label brings its
  // text back and picking what the item is brings that read's name.
  const lookLabels = new Map<string, { device: string; cloud: string; deviceName: string; cloudName: string }>();

  const evaluate = (): BoxResult => {
    const edition = currentEdition();
    const live = liveRead && liveRead.code === destinationCode ? liveRead.edition : undefined;
    const today = deps.today();
    return evaluateBox(items, edition, resolveDestination(edition, destinationCode, live, today), today);
  };
  let unsaved: readonly string[] = [];
  let loadState: NonNullable<BoxState["loadState"]> = "loading";
  // A country the sender chose before the saved box was read: it stands over the saved one.
  let chosenDestination: string | null = null;
  const snapshot = (result: BoxResult): BoxState => ({
    boxId, destinationCode, items, result, cloudConsent, sources, lastRecheckMs, errors, unsaved, loadState,
    destinationKnown: loadState === "ready" || chosenDestination !== null,
  });
  let state: BoxState = snapshot(evaluate());

  // What the server is believed to hold: each item's stored copy, and whether the box exists with which details.
  const server = new Map<string, string>();
  let serverMeta: string | null = null;
  let boxExists = false;
  const journal: Journal = deps.journal?.read(boxId) ?? { meta: null, items: {} };
  // The writes that failed last time ("meta" or an item id); they wait for a retry or the next edit.
  const failed = new Set<string>();
  // Items whose write is on its way: until it settles, the server may or may not have them.
  const inFlight = new Set<string>();
  // Set by close(): the box is being deleted, so nothing more is kept or sent.
  let closed = false;
  // An edit was made while closed, so reopen() has something to keep and send.
  let editedWhileClosed = false;
  const metaOf = (): BoxMeta => ({ destinationCode, sources, lastRecheckMs });
  const storedJson = (i: BoxItem) => stableJson(forStorage(i));
  const keepJournal = () => deps.journal?.write(boxId, journal);

  const publish = () => { for (const l of listeners) l(state); };
  const refreshUnsaved = () => {
    const pending = Object.keys(journal.items);
    const blocked = loadState === "failed" || (failed.has("meta") && !boxExists) || deps.persistence.localOnly?.() === true;
    unsaved = pending.filter((id) => blocked || failed.has(id));
    state = { ...state, unsaved, loadState };
  };

  // The journal entries an edit made: each item whose stored copy differs from the server's, each removed one,
  // and the box's details once the saved box has been read.
  const recordEdits = () => {
    const now = new Set(items.map((i) => i.itemId));
    for (const i of items) {
      const j = storedJson(i);
      // While a write of this item is out, the server's copy is about to change: a copy equal to the old one is
      // kept in the journal too, so it is sent after that write lands (a change and back, such as 1 to 3 to 1).
      if (server.get(i.itemId) === j && !inFlight.has(i.itemId)) delete journal.items[i.itemId];
      else journal.items[i.itemId] = forStorage(i);
    }
    // A removed item the server has, or may have (its write is on its way), is deleted there; one never sent is
    // only dropped from the journal.
    for (const id of Object.keys(journal.items)) {
      if (now.has(id)) continue;
      if (server.has(id) || inFlight.has(id)) journal.items[id] = null;
      else delete journal.items[id];
    }
    for (const id of server.keys()) if (!now.has(id)) journal.items[id] = null;
    if (loadState === "ready" && stableJson(metaOf()) !== serverMeta) journal.meta = metaOf();
    keepJournal();
  };

  // Sends the journal: the box's details first (a new box is created before its first item), then each item.
  let flushing: Promise<void> | null = null;
  let again = false;
  const flush = (): Promise<void> => {
    if (loadState !== "ready" || closed) return Promise.resolve();
    if (flushing) { again = true; return flushing; }
    flushing = (async () => {
      do {
        again = false;
        const hasItems = Object.keys(journal.items).length > 0;
        const meta = journal.meta ?? (!boxExists && hasItems ? metaOf() : null);
        if (meta) {
          const sent = journal.meta;
          try {
            await deps.persistence.putMeta(boxId, meta);
            boxExists = true;
            failed.delete("meta");
            if (deps.persistence.localOnly?.() !== true) {
              serverMeta = stableJson(meta);
              if (journal.meta === sent) journal.meta = null;
            }
          } catch {
            failed.add("meta");
          }
        }
        if (boxExists && !closed) {
          await Promise.all(Object.entries(journal.items).map(async ([id, item]) => {
            inFlight.add(id);
            try {
              if (item) await deps.persistence.putItem(boxId, item);
              else await deps.persistence.deleteItem(boxId, id);
              failed.delete(id);
              // A write kept only in this browser stays in the journal for the server. A write that landed is
              // what the server now holds, even when a newer edit made meanwhile (a change, or a removal now
              // waiting as a delete) stays in the journal to be sent next.
              if (deps.persistence.localOnly?.() !== true) {
                if (item) server.set(id, stableJson(item));
                else server.delete(id);
                // Done with this item unless a different copy was recorded while the write was out.
                const now = journal.items[id];
                if (now === item || (now && item && stableJson(now) === stableJson(item))) delete journal.items[id];
              }
            } catch {
              // The item was removed while its first write was out, and that write did not land: the server never
              // had it, so there is nothing to delete.
              if (item && journal.items[id] === null && !server.has(id)) {
                delete journal.items[id];
                failed.delete(id);
              } else {
                failed.add(id);
              }
            } finally {
              inFlight.delete(id);
            }
          }));
        }
        keepJournal();
      } while (again && !closed);
      const before = stableJson(unsaved);
      refreshUnsaved();
      if (stableJson(unsaved) !== before) publish();
    })().finally(() => { flushing = null; });
    return flushing;
  };

  // edit: the change came from the sender (or a read), so it is journaled and sent; a load or a notice is not.
  const commit = (result: BoxResult = evaluate(), edit = true) => {
    state = snapshot(result);
    if (closed) { if (edit) editedWhileClosed = true; publish(); return; }
    deps.deviceNames?.remember(boxId, Object.fromEntries(items.map((i) => [i.itemId, namesOf(i)])));
    if (edit) {
      recordEdits();
      refreshUnsaved();
      void flush();
    }
    publish();
  };
  const update = (itemId: string, change: (item: BoxItem) => BoxItem) => {
    if (!items.some((i) => i.itemId === itemId)) return;
    items = items.map((i) => (i.itemId === itemId ? change(i) : i));
    commit();
  };
  const tagsOf = (labelText: string) => labelTagsOf(labelText, currentEdition());

  // Tells listeners about a consent change without saving the box, which never holds consent. The Pack
  // page aborts cloud work when the answer stops being "allowed".
  const publishConsent = (v: boolean | null) => {
    cloudConsent = v;
    state = { ...state, cloudConsent };
    publish();
  };
  // Another tab on this device changed the answer.
  deps.consent?.onChange(publishConsent);

  // The names kept on this device replace the category labels the server has.
  const withNames = (i: BoxItem): BoxItem => {
    const n = (deps.deviceNames?.recall(boxId) ?? {})[i.itemId];
    if (n === undefined) return i;
    const overrides = n.override === undefined ? i.overrides : { ...i.overrides, itemName: n.override };
    return { ...i, read: { ...i.read, itemName: n.read }, overrides };
  };

  // Reads the saved box. Nothing is written by a read: edits made meanwhile and an earlier visit's unsaved edits
  // are merged over it and then sent. A read that failed leaves everything held.
  const load = async () => {
    loadState = "loading";
    const r = await deps.persistence.loadBox(boxId).catch((e: unknown) => ({ status: "failed" as const, error: String(e) }));
    if (r.status === "failed") {
      loadState = "failed";
      refreshUnsaved();
      commit(evaluate(), false);
      return;
    }
    const inMemory = new Set(items.map((i) => i.itemId));
    const saved = r.status === "found" ? r.box : {};
    boxExists = r.status === "found";
    server.clear();
    for (const i of saved.items ?? []) server.set(i.itemId, stableJson(i));
    // The saved items, an earlier visit's unsaved copies over them, its unsaved new items, then this visit's.
    const fromServer = (saved.items ?? []).filter((i) => !inMemory.has(i.itemId) && journal.items[i.itemId] !== null)
      .map((i) => journal.items[i.itemId] ?? i);
    const fromJournal = Object.values(journal.items).filter((i): i is BoxItem => i !== null && !inMemory.has(i.itemId) && !server.has(i.itemId));
    items = [...inAddedOrder([...fromServer, ...fromJournal].map(withNames)), ...items];
    const savedSources = { ...NO_SOURCES, ...saved.sources };
    serverMeta = boxExists ? stableJson({ destinationCode: saved.destinationCode ?? DEFAULT_DESTINATION, sources: savedSources, lastRecheckMs: saved.lastRecheckMs ?? null }) : null;
    destinationCode = chosenDestination ?? journal.meta?.destinationCode ?? saved.destinationCode ?? destinationCode;
    // Reads made while the box loaded add to the saved counts.
    sources = Object.fromEntries(Object.entries(savedSources).map(([k, v]) => [k, v + sources[k as keyof BoxSources]])) as unknown as BoxSources;
    lastRecheckMs = journal.meta?.lastRecheckMs ?? lastRecheckMs ?? saved.lastRecheckMs ?? null;
    loadState = "ready";
    if (chosenDestination !== null || stableJson(sources) !== stableJson(savedSources)) {
      if (boxExists || chosenDestination !== null || Object.keys(journal.items).length > 0) journal.meta = metaOf();
    }
    keepJournal();
    refreshUnsaved();
    commit(evaluate(), false);
    await flush();
  };
  const ready = load();

  return {
    ready,
    getState: () => state,
    edition: () => currentEdition(),
    setEdition(e) {
      switchedTo = e;
      commit(evaluate(), false);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    addRead(outcome, cropKey) {
      const itemId = deps.newId();
      const item: BoxItem = {
        itemId, read: outcome.read, overrides: {}, answers: {}, quantity: 1, identityConfirmedBy: null,
        labelTags: tagsOf(outcome.fullLabelText ?? outcome.read.labelText), readSource: outcome.unreported ? "cloud_unreported" : outcome.source, readMs: outcome.ms, secondLook: null, cropKey,
        customs: { ...EMPTY_CUSTOMS }, addedAt: clock(),
      };
      if (outcome.fallbackAfter) item.readFallback = { after: outcome.fallbackAfter, route: outcome.route };
      items = [...items, item];
      // The re-check line describes the last country change only; a new read is not part of it.
      lastRecheckMs = null;
      sources = {
        ...sources,
        onDevice: sources.onDevice + (outcome.source === "on_device" ? 1 : 0),
        inCloud: sources.inCloud + (outcome.source === "in_cloud" ? 1 : 0),
        cloudFallbacks: sources.cloudFallbacks + (outcome.fallbackAfter ? 1 : 0),
      };
      commit();
      return itemId;
    },
    addManual(read) {
      const itemId = deps.newId();
      // A typed item is the sender's own word; a ticked alcohol line is kept as theirs, so it is not asked again.
      items = [...items, {
        itemId, read, overrides: read.alcoholOnLabel ? { alcoholOnLabel: true } : {}, answers: {}, quantity: 1, identityConfirmedBy: "sender",
        labelTags: tagsOf(read.labelText), readSource: "manual", readMs: 0, secondLook: null, cropKey: null, customs: { ...EMPTY_CUSTOMS },
        addedAt: clock(),
      }];
      lastRecheckMs = null;
      commit();
      return itemId;
    },
    addRecorded(read, ms, cropKey) {
      const itemId = deps.newId();
      items = [...items, {
        itemId, read, overrides: {}, answers: {}, quantity: 1, identityConfirmedBy: null, labelTags: tagsOf(read.labelText),
        readSource: "sample_recorded", readMs: ms, secondLook: null, cropKey, customs: { ...EMPTY_CUSTOMS }, addedAt: clock(),
      }];
      lastRecheckMs = null;
      commit();
      return itemId;
    },
    mergeRemoteItem(item) {
      items = items.some((i) => i.itemId === item.itemId) ? items.map((i) => (i.itemId === item.itemId ? item : i)) : [...items, item];
      commit();
    },
    confirmIdentity: (itemId) => update(itemId, (i) => ({ ...i, identityConfirmedBy: "sender" })),
    applySecondLook(itemId, merged, ms, reason, cloudLabel, disputes = {}) {
      sources = { ...sources, secondLooks: sources.secondLooks + 1 };
      // A second look that worked replaces any earlier failure of it.
      if (errors[itemId] !== undefined) {
        const { [itemId]: _done, ...rest } = errors;
        void _done;
        errors = rest;
      }
      // A second look confirms identity only when both reads see the same kind of item.
      // The tags of every label either read saw, never only the merged one: a hazard word in the shorter
      // label still counts. The item's tags so far are the first read's. A label the sender corrected while
      // the cloud read ran stays theirs: only its tags are saved, so a reload gives the verdict they saw.
      update(itemId, (i) => {
        lookLabels.set(itemId, {
          device: i.read.labelText, cloud: Array.from(cloudLabel ?? "").slice(0, LABEL_TEXT_MAX).join(""),
          deviceName: i.read.itemName, cloudName: merged.itemName,
        });
        const cloudTags = tagsOf(cloudLabel ?? "");
        const found: ReadDisputes = { ...disputes };
        // Label words only one read saw: a dispute of tags (never of label text) the sender settles.
        if (cloudLabel !== undefined && wordsOf(i.labelTags) !== wordsOf(cloudTags)) {
          found.labelTags = { device: [...i.labelTags], cloud: cloudTags, resolved: false };
        }
        // A fact the sender corrected while the cloud read ran is theirs: no dispute stands on it.
        for (const f of DISPUTE_FIELDS) if (corrects(i.overrides, f)) delete found[f];
        return withDisputes({
          ...i, read: merged, secondLook: { ms, reason },
          // The merged label is one of the two reads' labels, clipped; its words come from that read's whole label.
          labelTags: i.overrides.labelText !== undefined ? i.labelTags
            : [...new Set([...i.labelTags, ...(cloudLabel === undefined ? tagsOf(merged.labelText) : cloudTags)])],
          identityConfirmedBy: i.identityConfirmedBy ?? (merged.category === i.read.category ? "second_look" : null),
        }, found);
      });
    },
    settleDispute: (itemId, field, side) => update(itemId, (i) => {
      const d = i.disputes?.[field];
      if (!d) return i;
      const value = d[side];
      // The picked reading is what the rules judge: an earlier correction of the same facts (part of the battery
      // numbers, say) no longer stays on top of it. Corrections of other facts stay.
      const picked: readonly string[] = field === "battery" ? ["volts", "milliampHours", "wattHours"] : field === "labelTags" ? ["labelText"] : [field];
      const overrides = Object.fromEntries(Object.entries(i.overrides).filter(([k]) => !picked.includes(k))) as Partial<ItemRead>;
      const next: BoxItem = { ...i, overrides, disputes: { ...i.disputes, [field]: { ...d, resolved: true } } as ReadDisputes };
      if (field === "battery") return { ...next, read: { ...next.read, ...(value as DisputeValues["battery"]) } };
      if (field === "labelTags") {
        // The label's words come with it; its text too while this device still has it (never after a reload).
        const text = lookLabels.get(itemId)?.[side];
        return { ...next, labelTags: [...(value as string[])], read: text === undefined ? next.read : { ...next.read, labelText: text } };
      }
      const read = { ...next.read, [field]: value } as ItemRead;
      if (field !== "category") return { ...next, read };
      // Picking what the item is confirms it, and names it as that read did (or by its category, once this
      // device no longer has that read's name).
      const names = lookLabels.get(itemId);
      const itemName = (side === "device" ? names?.deviceName : names?.cloudName) ?? CATEGORY_LABELS[value as ItemRead["category"]];
      return { ...next, read: { ...read, itemName }, identityConfirmedBy: next.identityConfirmedBy ?? "sender" };
    }),
    setError(itemId, text) {
      errors = { ...errors, [itemId]: text };
      commit(state.result, false);
    },
    answer: (itemId, questionId, answerId) => update(itemId, (i) => ({ ...i, answers: { ...i.answers, [questionId]: answerId } })),
    override: (itemId, patch) => update(itemId, (i) => {
      const next: BoxItem = {
        ...i, overrides: { ...i.overrides, ...patch },
        // A corrected label replaces the read one, so its tags must survive the label text not being saved.
        labelTags: patch.labelText !== undefined ? tagsOf(patch.labelText) : i.labelTags,
      };
      if (!i.disputes) return next;
      // The sender's own correction of a disputed fact settles that dispute.
      const settled: ReadDisputes = { ...i.disputes };
      for (const f of DISPUTE_FIELDS) {
        const d = settled[f];
        if (d && corrects(patch, f)) (settled as Record<DisputeField, unknown>)[f] = { ...d, resolved: true };
      }
      return withDisputes(next, settled);
    }),
    setQuantity: (itemId, n) => update(itemId, (i) => ({ ...i, quantity: clampQuantity(n) })),
    setCustoms: (itemId, patch) => update(itemId, (i) => ({ ...i, customs: { ...i.customs, ...patch } })),
    remove(itemId) {
      items = items.filter((i) => i.itemId !== itemId);
      lookLabels.delete(itemId);
      const { [itemId]: _gone, ...rest } = errors;
      void _gone;
      errors = rest;
      commit();
    },
    setDestination(code) {
      // A choice made before the saved box was read stands over the saved country, even the same as shown.
      if (loadState !== "ready") chosenDestination = code;
      if (code === destinationCode) {
        if (loadState !== "ready") commit(state.result, false);
        return;
      }
      destinationCode = code;
      if (liveRead && liveRead.code !== code) liveRead = null;
      const start = deps.now();
      const result = evaluate();
      lastRecheckMs = deps.now() - start;
      sources = { ...sources, rulesOnlyRechecks: sources.rulesOnlyRechecks + 1 };
      commit(result);
    },
    setLiveRead(code, edition) {
      liveRead = { code, edition };
      commit(evaluate(), false);
    },
    consentNow: () => (deps.consent ? deps.consent.get() : cloudConsent),
    // After a read that failed, saving again means reading the box again first.
    retrySave: () => {
      if (loadState === "failed") { void load(); return; }
      failed.clear(); refreshUnsaved(); publish(); void flush();
    },
    retryLoad: () => (loadState === "failed" ? load() : Promise.resolve()),
    async settled() {
      await ready;
      while (flushing) await flushing;
    },
    async close() {
      closed = true;
      while (flushing) await flushing;
    },
    // Writes only when an edit was made while closed: the journal is shared by this browser's tabs, so writing this
    // page's copy without one would overwrite another tab's unsent edits.
    reopen() {
      if (!closed) return;
      closed = false;
      if (editedWhileClosed) { editedWhileClosed = false; commit(); }
    },
    setConsent(v) {
      deps.consent?.set(v);
      publishConsent(v);
    },
  };
}
