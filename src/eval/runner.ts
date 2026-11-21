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
}

export type EvalPath = "device" | "cloud" | "shipped";
export const ALL_PATHS: readonly EvalPath[] = ["device", "cloud", "shipped"];

export interface RunnerFailure { itemId: string; path: "device" | "cloud" | "shipped" | "second_look"; error: string }

// The cloud is allowed for the eval, as for a sender who chose cloud checks.
const CLOUD_ON = { cloudConsent: true, killCloud: false, online: true } as const;

const message = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

// The level the Pack page shows for this read, alone in its box, for each destination, after an optional second look.
async function levelsOf(edition: RuleEdition, date: string, destinations: readonly string[], outcome: ReadOutcome,
  after?: (store: ReturnType<typeof createBoxStore>, itemId: string) => Promise<void>): Promise<Record<string, Level>> {
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
  return out;
}

export async function evalRows(i: RunnerInput): Promise<{ rows: EvalRow[]; failures: RunnerFailure[] }> {
  const repeat = Math.max(1, i.repeat ?? 1);
  const policy = i.secondLook ?? SECOND_LOOK_DEFAULT;
  const paths = new Set(i.paths ?? ALL_PATHS);
  const rows: EvalRow[] = [];
  const failures: RunnerFailure[] = [];
  for (const item of i.set.items) {
    const image = i.images[item.itemId];
    if (!image) throw new Error(`${item.itemId}: no photo`);

    const path = async (name: "device" | "cloud", route: "device_only" | "cloud_only") => {
      try {
        const outcomes: ReadOutcome[] = [];
        for (let k = 0; k < repeat; k++) outcomes.push(await readItem(i.models, image, route, i.now));
        const first = outcomes[0]!;
        const levels = await levelsOf(i.edition, i.date, i.set.destinations, first);
        return { read: first.read, msRuns: outcomes.map((o) => Math.round(o.ms)), levels };
      } catch (e) {
        failures.push({ itemId: item.itemId, path: name, error: message(e) });
        return null;
      }
    };
    const device = paths.has("device") ? await path("device", "device_only") : null;
    const cloud = paths.has("cloud") ? await path("cloud", "cloud_only") : null;

    let shipped: { levels: Record<string, Level>; source: string; secondLook: boolean } | null = null;
    if (paths.has("shipped")) try {
      const outcome = await readItem(i.models, image, "hybrid", i.now);
      let looked = false;
      const levels = await levelsOf(i.edition, i.date, i.set.destinations, outcome, async (store, itemId) => {
        const added = store.getState().items.find((x) => x.itemId === itemId);
        const reason = added ? needsSecondLook(deriveFacts(added, i.edition), outcome, policy) : null;
        if (!reason || !shouldRunSecondLook(reason, CLOUD_ON)) return;
        // A second look that fails leaves the item and its first read in place, as the Pack page does.
        try {
          const out = await runSecondLook(i.models.cloud, image, outcome.read, i.now, i.models.fallback);
          store.applySecondLook(itemId, out.merged, out.ms, SECOND_LOOK_TEXT[reason], out.cloudLabel, out.disputes);
          looked = true;
        } catch (e) {
          failures.push({ itemId: item.itemId, path: "second_look", error: message(e) });
        }
      });
      shipped = { levels, source: outcome.source, secondLook: looked };
    } catch (e) {
      failures.push({ itemId: item.itemId, path: "shipped", error: message(e) });
    }

    for (const destination of i.set.destinations) {
      const pathResult = (p: typeof device): PathResult | null => (p ? { read: p.read, msRuns: p.msRuns, level: p.levels[destination]! } : null);
      rows.push({
        itemId: item.itemId, destination, device: pathResult(device), cloud: pathResult(cloud),
        shipped: shipped ? { level: shipped.levels[destination]!, source: shipped.source, secondLook: shipped.secondLook }
          : { level: "check", source: paths.has("shipped") ? "failed" : "not_run", secondLook: false },
      });
    }
  }
  return { rows, failures };
}
