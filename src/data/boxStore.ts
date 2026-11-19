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
import type { DeviceConsent } from "./deviceConsent";

// Where an item's read came from. The phones use one name each for both of them.
// cloud_unreported: the SDK named no route, so it counts as cloud and the card says so.
export type ReadSource = InferenceSourceName | "cloud_unreported" | "manual" | "phone_on_device" | "phone_cloud";

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
  // Items whose last save did not reach the server: what the card shows is on this device only.
  unsaved?: readonly string[];
}

export interface BoxPersistence {
  // Saves the box. Consent is never part of it: each device keeps its own answer (deviceConsent.ts).
  save(state: BoxState): void;
  load(boxId: string): Promise<Partial<BoxState> | null>;
  // Told after each save which items did not save, when this copy can fail (an empty set once all have).
  onUnsaved?(listener: (ids: ReadonlySet<string>) => void): void;
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
  // Saves the box again, as it is now (after a save that did not reach the server).
  retrySave(): void;
  // This device's answer as stored now, read fresh: right before a cloud call it may differ from the state
  // a page last rendered, if another tab changed it.
  consentNow(): boolean | null;
}

export interface BoxStoreDeps {
  edition: () => RuleEdition;
  persistence: BoxPersistence;
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

const DEFAULT_DESTINATION = "CA";

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
    return evaluateBox(items, edition, resolveDestination(edition, destinationCode, live), deps.today());
  };
  let unsaved: readonly string[] = [];
  let state: BoxState = { boxId, destinationCode, items, result: evaluate(), cloudConsent, sources, lastRecheckMs, errors, unsaved };

  const commit = (result: BoxResult = evaluate()) => {
    state = { boxId, destinationCode, items, result, cloudConsent, sources, lastRecheckMs, errors, unsaved };
    deps.persistence.save({ ...state, items: items.map(forStorage) });
    deps.deviceNames?.remember(boxId, Object.fromEntries(items.map((i) => [i.itemId, namesOf(i)])));
    for (const l of listeners) l(state);
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
    for (const l of listeners) l(state);
  };
  // Another tab on this device changed the answer.
  deps.consent?.onChange(publishConsent);
  // The saved copy says which items it could not save; the cards say so, with no new save.
  deps.persistence.onUnsaved?.((ids) => {
    unsaved = [...ids];
    state = { ...state, unsaved };
    for (const l of listeners) l(state);
  });

  const ready = deps.persistence.load(boxId).then((saved) => {
    if (!saved) return;
    const known = new Set(items.map((i) => i.itemId));
    // The names kept on this device replace the category labels the server has.
    const names = deps.deviceNames?.recall(boxId) ?? {};
    const withNames = (saved.items ?? []).map((i) => {
      const n = names[i.itemId];
      if (n === undefined) return i;
      const overrides = n.override === undefined ? i.overrides : { ...i.overrides, itemName: n.override };
      return { ...i, read: { ...i.read, itemName: n.read }, overrides };
    });
    items = [...inAddedOrder(withNames.filter((i) => !known.has(i.itemId))), ...items];
    if (saved.destinationCode) destinationCode = saved.destinationCode;
    // A box saved before a count existed starts that count at 0.
    if (saved.sources) sources = { ...NO_SOURCES, ...saved.sources };
    commit();
  });

  return {
    ready,
    getState: () => state,
    edition: () => currentEdition(),
    setEdition(e) {
      switchedTo = e;
      commit();
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
      const next: BoxItem = { ...i, disputes: { ...i.disputes, [field]: { ...d, resolved: true } } as ReadDisputes };
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
      commit(state.result);
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
      if (code === destinationCode) return;
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
      commit();
    },
    consentNow: () => (deps.consent ? deps.consent.get() : cloudConsent),
    retrySave: () => commit(),
    setConsent(v) {
      deps.consent?.set(v);
      publishConsent(v);
    },
  };
}
