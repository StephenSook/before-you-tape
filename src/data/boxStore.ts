// The box: local-first, with verdicts always derived (plan Task 18). Every change re-runs evaluateBox, so
// a verdict is never read back from storage. Label text stays in memory and with the crop on this device;
// the copy handed to persistence carries only the tags found in it.
import type { FallbackAfter, ReadOutcome } from "../ai/itemRead";
import type { InferenceSourceName, ReadRoute } from "../ai/port";
import { resolveDestination } from "../engine/edition";
import { labelTagsOf } from "../engine/facts";
import type { BoxItemInput, DestinationEdition, RuleEdition } from "../engine/types";
import { evaluateBox, type BoxResult } from "../engine/verdict";
import type { ItemRead } from "../shared/itemRead";

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
}

export interface BoxPersistence {
  save(state: BoxState): void;
  load(boxId: string): Promise<Partial<BoxState> | null>;
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
  applySecondLook(itemId: string, merged: ItemRead, ms: number, reason: string): void;
  setError(itemId: string, text: string): void;
  answer(itemId: string, questionId: string, answerId: string): void;
  override(itemId: string, patch: Partial<ItemRead>): void;
  setQuantity(itemId: string, n: number): void;
  setCustoms(itemId: string, patch: Partial<CustomsLine>): void;
  remove(itemId: string): void;
  setDestination(code: string): void;
  setLiveRead(code: string, edition: DestinationEdition): void;
  setConsent(v: boolean | null): void;
}

export interface BoxStoreDeps {
  edition: () => RuleEdition;
  persistence: BoxPersistence;
  now: () => number;
  // The device's own local calendar date, YYYY-MM-DD.
  today: () => string;
  newId: () => string;
  boxId?: string;
}

const DEFAULT_DESTINATION = "CA";
const EMPTY_CUSTOMS: CustomsLine = { description: "", lintOk: false, weightOz: null, valueUsd: null, countryOfOrigin: null, upc: null };

const clampQuantity = (n: number) => (Number.isFinite(n) ? Math.min(99, Math.max(1, Math.round(n))) : 1);

// The copy that leaves memory: no label text, read or corrected; the tags stand in for it.
function forStorage(item: BoxItem): BoxItem {
  const { labelText: _dropped, ...overrides } = item.overrides;
  void _dropped;
  return { ...item, read: { ...item.read, labelText: "" }, overrides };
}

export function createBoxStore(deps: BoxStoreDeps): BoxStore {
  let items: BoxItem[] = [];
  let switchedTo: RuleEdition | null = null;
  const currentEdition = () => switchedTo ?? deps.edition();
  let destinationCode = DEFAULT_DESTINATION;
  let liveRead: { code: string; edition: DestinationEdition } | null = null;
  let cloudConsent: boolean | null = null;
  let sources: BoxSources = { ...NO_SOURCES };
  let lastRecheckMs: number | null = null;
  let errors: Record<string, string> = {};
  const boxId = deps.boxId ?? deps.newId();
  const listeners = new Set<(s: BoxState) => void>();

  const evaluate = (): BoxResult => {
    const edition = currentEdition();
    const live = liveRead && liveRead.code === destinationCode ? liveRead.edition : undefined;
    return evaluateBox(items, edition, resolveDestination(edition, destinationCode, live), deps.today());
  };
  let state: BoxState = { boxId, destinationCode, items, result: evaluate(), cloudConsent, sources, lastRecheckMs, errors };

  const commit = (result: BoxResult = evaluate()) => {
    state = { boxId, destinationCode, items, result, cloudConsent, sources, lastRecheckMs, errors };
    deps.persistence.save({ ...state, items: items.map(forStorage) });
    for (const l of listeners) l(state);
  };
  const update = (itemId: string, change: (item: BoxItem) => BoxItem) => {
    if (!items.some((i) => i.itemId === itemId)) return;
    items = items.map((i) => (i.itemId === itemId ? change(i) : i));
    commit();
  };
  const tagsOf = (labelText: string) => labelTagsOf(labelText, currentEdition());

  const ready = deps.persistence.load(boxId).then((saved) => {
    if (!saved) return;
    const known = new Set(items.map((i) => i.itemId));
    items = [...(saved.items ?? []).filter((i) => !known.has(i.itemId)), ...items];
    if (saved.destinationCode) destinationCode = saved.destinationCode;
    if (saved.cloudConsent !== undefined && cloudConsent === null) cloudConsent = saved.cloudConsent;
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
        labelTags: tagsOf(outcome.read.labelText), readSource: outcome.unreported ? "cloud_unreported" : outcome.source, readMs: outcome.ms, secondLook: null, cropKey,
        customs: { ...EMPTY_CUSTOMS },
      };
      if (outcome.fallbackAfter) item.readFallback = { after: outcome.fallbackAfter, route: outcome.route };
      items = [...items, item];
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
      items = [...items, {
        itemId, read, overrides: {}, answers: {}, quantity: 1, identityConfirmedBy: "sender",
        labelTags: tagsOf(read.labelText), readSource: "manual", readMs: 0, secondLook: null, cropKey: null, customs: { ...EMPTY_CUSTOMS },
      }];
      commit();
      return itemId;
    },
    mergeRemoteItem(item) {
      items = items.some((i) => i.itemId === item.itemId) ? items.map((i) => (i.itemId === item.itemId ? item : i)) : [...items, item];
      commit();
    },
    confirmIdentity: (itemId) => update(itemId, (i) => ({ ...i, identityConfirmedBy: "sender" })),
    applySecondLook(itemId, merged, ms, reason) {
      sources = { ...sources, secondLooks: sources.secondLooks + 1 };
      // A second look that worked replaces any earlier failure of it.
      if (errors[itemId] !== undefined) {
        const { [itemId]: _done, ...rest } = errors;
        void _done;
        errors = rest;
      }
      // A second look confirms identity only when both reads see the same kind of item.
      update(itemId, (i) => ({
        ...i, read: merged, labelTags: tagsOf(merged.labelText), secondLook: { ms, reason },
        identityConfirmedBy: i.identityConfirmedBy ?? (merged.category === i.read.category ? "second_look" : null),
      }));
    },
    setError(itemId, text) {
      errors = { ...errors, [itemId]: text };
      commit(state.result);
    },
    answer: (itemId, questionId, answerId) => update(itemId, (i) => ({ ...i, answers: { ...i.answers, [questionId]: answerId } })),
    override: (itemId, patch) => update(itemId, (i) => ({
      ...i, overrides: { ...i.overrides, ...patch },
      // A corrected label replaces the read one, so its tags must survive the label text not being saved.
      labelTags: patch.labelText !== undefined ? tagsOf(patch.labelText) : i.labelTags,
    })),
    setQuantity: (itemId, n) => update(itemId, (i) => ({ ...i, quantity: clampQuantity(n) })),
    setCustoms: (itemId, patch) => update(itemId, (i) => ({ ...i, customs: { ...i.customs, ...patch } })),
    remove(itemId) {
      items = items.filter((i) => i.itemId !== itemId);
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
    setConsent(v) {
      cloudConsent = v;
      commit(state.result);
    },
  };
}
