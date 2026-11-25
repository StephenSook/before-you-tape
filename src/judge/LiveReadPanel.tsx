// One live read of the sample photo through the app's real read path, for a judge who wants to see a model run
// rather than the typed sample box. Nothing loads until the button is pressed. It reads on this device when it
// can, and otherwise in the cloud, only after Allow. The time shown runs from the press that starts the read
// (the button, or Allow when the question was asked) to the verdict on screen.
import { useEffect, useRef, useState } from "react";
import { readItem, ReadFailure, type ReadFailureKind } from "../ai/itemRead";
import type { GateState, ImagePart, ItemModels } from "../ai/port";
import type { VerdictLevel } from "../engine/types";
import type { ItemRead } from "../shared/itemRead";
import { CATEGORY_LABELS } from "../ui/categoryLabels";
import { ConsentNotice } from "../ui/ConsentNotice";
import { inCountry } from "../ui/countryName";
import { VerdictChip } from "../ui/VerdictChip";

export interface LiveReadDeps {
  gate(): Promise<GateState>;
  consent: { get(): boolean | null; set(v: boolean): void };
  // Waits for the cloud settings, with a limit, and says whether cloud checks are paused (unknown counts as paused).
  paused(): Promise<boolean>;
  models(): ItemModels;
  // The tracked sample photo, cropped whole. Rejects with SampleMismatch when its bytes are not the record's.
  sample(): Promise<ImagePart>;
}

const seconds = (ms: number) => (ms / 1000).toFixed(1);

export class SampleMismatch extends Error {
  constructor() { super("the sample photo's bytes do not match its record"); }
}

const DEVICE_ONLY = "This device can't read photos on its own, and cloud checks are off. Nothing was read.";
const PAUSED = "Cloud checks are paused right now, and this device can't read photos on its own. Nothing was read.";
const SAMPLE = "The sample photo did not match its record, so it was not read.";
const WHY: Record<ReadFailureKind, string> = {
  blocked: "it was stopped before it was sent",
  device_failed: "this device could not read it",
  leak_guard: "a device-only read came back from the cloud, so it was thrown away",
  cloud_refused: "the cloud refused it",
  cloud_unreachable: "the cloud could not be reached",
  invalid_output: "the reply did not make sense",
};
const failText = (e: unknown) =>
  e instanceof SampleMismatch ? SAMPLE : `The live read did not finish: ${e instanceof ReadFailure ? WHY[e.kind] : "something went wrong"}. Try again in a moment.`;

type View =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "asking"; deps: LiveReadDeps }
  // The time from the press that started the read, and its parts: starting (loading the app's parts and checking
  // where to read), the photo (fetched, checked and cropped) and the model's run.
  | { kind: "done"; read: ItemRead; inCloud: boolean; ms: number; steps: { start: number; photo: number; model: number } }
  | { kind: "failed"; text: string };

export interface LiveReadPanelProps {
  load: () => Promise<LiveReadDeps>;
  // The verdict for the read, judged for the country picked now, so a country change re-judges it.
  judge: (read: ItemRead) => VerdictLevel;
  // The country picked now, named with the verdict.
  country: string;
  now?: () => number;
  // One read at a time, then this long before the next, so the button cannot run reads back to back.
  cooldownMs?: number;
}

export function LiveReadPanel({ load, judge, country, now = () => performance.now(), cooldownMs = 10_000 }: LiveReadPanelProps) {
  const [view, setView] = useState<View>({ kind: "idle" });
  const [cooling, setCooling] = useState(false);
  const running = useRef(false);
  const gone = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { gone.current = true; if (timer.current) clearTimeout(timer.current); }, []);

  const finish = (v: View) => {
    if (gone.current) return;
    setView(v);
    running.current = false;
    setCooling(true);
    timer.current = setTimeout(() => { if (!gone.current) setCooling(false); }, cooldownMs);
  };

  const read = async (d: LiveReadDeps, inCloudRoute: boolean, start: number) => {
    try {
      const begun = now();
      const part = await d.sample();
      const photoDone = now();
      const route = inCloudRoute ? "cloud_only" : "device_only";
      const out = await readItem(d.models(), part, route, () => performance.now(), () => !inCloudRoute || d.consent.get() === true);
      const end = now();
      finish({ kind: "done", read: out.read, inCloud: out.source === "in_cloud", ms: end - start,
        steps: { start: begun - start, photo: photoDone - begun, model: end - photoDone } });
    } catch (e) {
      finish({ kind: "failed", text: failText(e) });
    }
  };

  const press = async () => {
    if (running.current || cooling) return;
    running.current = true;
    const start = now();
    setView({ kind: "busy" });
    try {
      const d = await load();
      if ((await d.gate()) === "available") { await read(d, false, start); return; }
      if (await d.paused()) { finish({ kind: "failed", text: PAUSED }); return; }
      if (d.consent.get() === true) { await read(d, true, start); return; }
      if (!gone.current) setView({ kind: "asking", deps: d });
    } catch (e) {
      finish({ kind: "failed", text: failText(e) });
    }
  };

  const answer = (allow: boolean) => {
    if (view.kind !== "asking") return;
    const d = view.deps;
    d.consent.set(allow);
    if (!allow) { finish({ kind: "failed", text: DEVICE_ONLY }); return; }
    setView({ kind: "busy" });
    void read(d, true, now());
  };

  const busy = view.kind === "busy" || view.kind === "asking";
  return (
    <section id="live-read" data-testid="live-read" aria-labelledby="live-read-heading">
      <h2 id="live-read-heading">One live read</h2>
      <p>Reads the sample lotion photo, with its brand blurred, with the app's real models: on this device when it can, otherwise in the cloud, after you allow it.</p>
      <button type="button" onClick={() => void press()} disabled={busy || cooling}>Run one live read</button>
      {view.kind === "busy" && <p role="status">Reading the sample photo.</p>}
      {view.kind === "asking" && <ConsentNotice onChoice={answer} />}
      {view.kind === "failed" && <p role="alert">{view.text}</p>}
      {view.kind === "done" && (
        <div data-testid="live-read-result">
          <p data-testid="live-read-where">{view.inCloud ? "Read in the cloud" : "Read on this device"}, {seconds(view.ms)} s</p>
          <p data-testid="live-read-verdict"><VerdictChip level={judge(view.read)} /> for {inCountry(country)}</p>
          {/* The category the model picked, in the app's words. The item name it read off the label is not shown: it can carry a brand. */}
          <p data-testid="live-read-name">The model read it as: {CATEGORY_LABELS[view.read.category]}</p>
          <p data-testid="live-read-photo">Read from the sample photo with the brand blurred.</p>
          <details>
            <summary>Details</summary>
            <p>Start: {seconds(view.steps.start)} s. Photo: {seconds(view.steps.photo)} s. Model: {seconds(view.steps.model)} s.</p>
            {view.steps.model > view.ms / 2 && <p>Most of this time was the model's run.</p>}
          </details>
        </div>
      )}
    </section>
  );
}
