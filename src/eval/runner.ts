// The model paths of eval/PROTOCOL.md: each item read on the device, in the cloud, and on the route the app
// ships (the hybrid route, with the app's own second look), and each read judged for every destination by the
// app's own box store, as the Pack page would show it. A path that fails is recorded as failed, never guessed.
// The models are given, so this runs the same in a test and in the browser harness.
import type { ImagePart, ItemModels } from "../ai/port";
import { readItem, type ReadOutcome } from "../ai/itemRead";
import { runSecondLook, SECOND_LOOK_TEXT } from "../ai/secondLook";
import { noPersistence } from "../data/boxOps";
import { createBoxStore } from "../data/boxStore";
import { deriveFacts } from "../engine/facts";
import type { RuleEdition } from "../engine/types";
import { needsSecondLook, SECOND_LOOK_DEFAULT, shouldRunSecondLook, type SecondLookPolicy } from "../routing/policy";
import { isNoItem } from "../shared/noItem";
import { READ_TIMEOUT_MS } from "../shared/readLimit";
import type { ItemRead } from "../shared/itemRead";
import type { EvalRow, EvalSet, Level, PathResult } from "./types";

export interface RunnerInput {
  set: EvalSet;
  edition: RuleEdition;
  // The day the rules are applied, as on the sender's device.
  date: string;
  models: ItemModels;
  // The photo each item is read from, cropped as the app crops it.
  images: Record<string, ImagePart>;
  now: () => number;
  // How many times each of the device and cloud paths is timed; the first read is the one judged.
  repeat?: number;
  secondLook?: SecondLookPolicy;
  // The paths to run (all three by default). A path not run is null, and a shipped route not run is "not_run".
  paths?: readonly EvalPath[];
  // How long a read or a second look may take, as on the Pack page (READ_TIMEOUT_MS unless a test sets it).
  limitMs?: number;
  // Read once on the device and in the cloud before the first item and report that time apart, so the cold first
  // call is not one of the timed runs (eval/PROTOCOL.md, "Latency").
  coldCall?: boolean;
}

export type EvalPath = "device" | "cloud" | "shipped";
export const ALL_PATHS: readonly EvalPath[] = ["device", "cloud", "shipped"];

export interface RunnerFailure { itemId: string; path: "device" | "cloud" | "shipped" | "second_look"; error: string }

// The cloud is allowed for the eval, as for a sender who chose cloud checks.
const CLOUD_ON = { cloudConsent: true, killCloud: false, online: true } as const;

const message = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

class NoItem extends Error {}

class TooSlow extends Error {
  constructor(ms: number) {
    super(`over ${ms} ms`);
    this.name = "TooSlow";
  }
}

// Runs one model call with the Pack page's time limit; past it the call is aborted and the result is not used.
async function within<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const work = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, fail) => { timer = setTimeout(() => { work.abort(); fail(new TooSlow(ms)); }, ms); });
  try {
    return await Promise.race([run(work.signal), late]);
  } finally {
    clearTimeout(timer);
  }
}

// The level the Pack page shows for this read, alone in its box, for each destination, after an optional second look,
// and the read the card then shows.
async function judged(edition: RuleEdition, date: string, destinations: readonly string[], outcome: ReadOutcome,
  after?: (store: ReturnType<typeof createBoxStore>, itemId: string) => Promise<void>): Promise<{ levels: Record<string, Level>; read: ItemRead }> {
  let n = 0;
  const store = createBoxStore({ edition: () => edition, persistence: noPersistence(), now: () => 0, today: () => date, newId: () => `eval-${n++}` });
  await store.ready;
  const itemId = store.addRead(outcome, "eval");
  if (after) await after(store, itemId);
  const out: Record<string, Level> = {};
  for (const d of destinations) {
    store.setDestination(d);
    const verdict = store.getState().result.items[itemId];
    if (!verdict) throw new Error(`no verdict for ${itemId} in ${d}`);
    out[d] = verdict.level;
  }
  const shown = store.getState().items.find((x) => x.itemId === itemId);
  if (!shown) throw new Error(`no item ${itemId}`);
  return { levels: out, read: shown.read };
}

export interface RunnerResult { rows: EvalRow[]; failures: RunnerFailure[]; cold: { device: number | null; cloud: number | null } }

export async function evalRows(i: RunnerInput): Promise<RunnerResult> {
  const repeat = Math.max(1, i.repeat ?? 1);
  const policy = i.secondLook ?? SECOND_LOOK_DEFAULT;
  const paths = new Set(i.paths ?? ALL_PATHS);
  const limit = i.limitMs ?? READ_TIMEOUT_MS;
  const rows: EvalRow[] = [];
  const failures: RunnerFailure[] = [];
  const cold: RunnerResult["cold"] = { device: null, cloud: null };
  const firstImage = i.set.items[0] ? i.images[i.set.items[0].itemId] : undefined;
  if (i.coldCall && firstImage) {
    for (const [name, route] of [["device", "device_only"], ["cloud", "cloud_only"]] as const) {
      if (!paths.has(name)) continue;
      try {
        cold[name] = Math.round((await within(limit, (signal) => readItem(i.models, firstImage, route, i.now, undefined, signal))).ms);
      } catch (e) {
        failures.push({ itemId: i.set.items[0]!.itemId, path: name, error: `cold call: ${message(e)}` });
      }
    }
  }
  for (const item of i.set.items) {
    const image = i.images[item.itemId];
    if (!image) throw new Error(`${item.itemId}: no photo`);

    const read = (route: "device_only" | "cloud_only" | "hybrid") =>
      within(limit, (signal) => readItem(i.models, image, route, i.now, undefined, signal));
    // The first read is the one judged; the others only time the path. A read of no item gets no verdict.
    const path = async (name: "device" | "cloud", route: "device_only" | "cloud_only") => {
      try {
        const first = await read(route);
        const noItem = isNoItem(first.read);
        if (noItem) failures.push({ itemId: item.itemId, path: name, error: "no item found" });
        const ms = [first.ms];
        for (let k = 1; k < repeat; k++) {
          try {
            ms.push((await read(route)).ms);
          } catch (e) {
            failures.push({ itemId: item.itemId, path: name, error: `timing run ${k + 1}: ${message(e)}` });
          }
        }
        // A read of no item gets no card on the Pack page, so it has no level of its own.
        const levels = noItem ? Object.fromEntries(i.set.destinations.map((d) => [d, "check" as Level]))
          : (await judged(i.edition, i.date, i.set.destinations, first)).levels;
        return { read: first.read, msRuns: ms.map((v) => Math.round(v)), levels, ...(noItem ? { noItem: true as const } : {}) };
      } catch (e) {
        failures.push({ itemId: item.itemId, path: name, error: message(e) });
        return null;
      }
    };
    const device = paths.has("device") ? await path("device", "device_only") : null;
    const cloud = paths.has("cloud") ? await path("cloud", "cloud_only") : null;

    let shipped: { levels: Record<string, Level>; source: string; secondLook: boolean; read: ItemRead; msRuns: number[]; secondLookMs?: number } | null = null;
    let noVerdict = paths.has("shipped") ? "failed" : "not_run";
    // A read of no item gets no verdict, but its numbers and its times still count.
    let noItemRead: { read: ItemRead; msRuns: number[] } | null = null;
    if (paths.has("shipped")) try {
      const outcome: ReadOutcome = await read("hybrid");
      // The first shipped read is the one judged; the others only time the route, as on the other paths.
      const timed = async () => {
        const ms = [outcome.ms];
        for (let k = 1; k < repeat; k++) {
          try {
            ms.push((await read("hybrid")).ms);
          } catch (e) {
            failures.push({ itemId: item.itemId, path: "shipped", error: `timing run ${k + 1}: ${message(e)}` });
          }
        }
        return ms.map((v) => Math.round(v));
      };
      if (isNoItem(outcome.read)) {
        noItemRead = { read: outcome.read, msRuns: await timed() };
        throw new NoItem();
      }
      let looked = false;
      let lookMs: number | undefined;
      const result = await judged(i.edition, i.date, i.set.destinations, outcome, async (store, itemId) => {
        const added = store.getState().items.find((x) => x.itemId === itemId);
        const reason = added ? needsSecondLook(deriveFacts(added, i.edition), outcome, policy) : null;
        if (!reason || !shouldRunSecondLook(reason, CLOUD_ON)) return;
        // A second look that fails leaves the item and its first read in place, as the Pack page does.
        try {
          const out = await within(limit, (signal) => runSecondLook(i.models.cloud, image, outcome.read, i.now, i.models.fallback, undefined, signal));
          store.applySecondLook(itemId, out.merged, out.ms, SECOND_LOOK_TEXT[reason], out.cloudLabel, out.disputes);
          looked = true;
          lookMs = Math.round(out.ms);
        } catch (e) {
          failures.push({ itemId: item.itemId, path: "second_look", error: message(e) });
        }
      });
      shipped = { levels: result.levels, source: outcome.source, secondLook: looked, read: result.read, msRuns: await timed(), ...(lookMs !== undefined ? { secondLookMs: lookMs } : {}) };
    } catch (e) {
      if (e instanceof NoItem) noVerdict = "no_item";
      else {
        noVerdict = e instanceof TooSlow ? "too_slow" : "failed";
        failures.push({ itemId: item.itemId, path: "shipped", error: message(e) });
      }
    }

    for (const destination of i.set.destinations) {
      const pathResult = (p: typeof device): PathResult | null =>
        (p ? { read: p.read, msRuns: p.msRuns, level: p.levels[destination]!, ...(p.noItem ? { noItem: true as const } : {}) } : null);
      rows.push({
        itemId: item.itemId, destination, device: pathResult(device), cloud: pathResult(cloud),
        shipped: shipped
          ? { level: shipped.levels[destination]!, source: shipped.source, secondLook: shipped.secondLook, read: shipped.read, msRuns: shipped.msRuns,
            ...(shipped.secondLookMs !== undefined ? { secondLookMs: shipped.secondLookMs } : {}) }
          : { level: "check", source: noVerdict, secondLook: false, ...(noItemRead ?? {}) },
      });
    }
  }
  return { rows, failures, cold };
}
