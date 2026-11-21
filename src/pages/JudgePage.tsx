// /judge: a ready sample box a judge can try with no camera, no built-in model and no sign-in. Nine real items
// from the eval photo set, with what each label says typed in by us, judged by the app's own rules engine in
// the browser. Switching the country re-checks the whole box with no model call.
import { useState, useSyncExternalStore } from "react";
import { noPersistence } from "../data/boxOps";
import { createBoxStore, type BoxItem, type BoxStore } from "../data/boxStore";
import { longDate } from "../engine/destination";
import { resolveDestination } from "../engine/edition";
import { evaluateBox } from "../engine/verdict";
import { labelTagsOf } from "../engine/facts";
import { rulesReadBy } from "../engine/layers";
import type { RuleEdition } from "../engine/types";
import manifest from "../../eval/set/manifest.json";
import { MATCHED_PAIRS, type MatchedPair } from "../judge/matchedPairs";
import { LiveReadPanel, type LiveReadDeps } from "../judge/LiveReadPanel";
import type { RecordedReads } from "../judge/recordedReads";
import { SAMPLE_BOX } from "../judge/sampleBox";
import { thumbOf } from "../judge/thumbs";
import type { ItemCategory, ItemRead } from "../shared/itemRead";
import { CATEGORY_LABELS } from "../ui/categoryLabels";
import { ANDROID_RELEASE_URL, SOURCE_URL } from "../ui/sourceLink";
import { BoxSummary } from "../ui/BoxSummary";
import { DestinationPicker, type DestinationIndexEntry } from "../ui/DestinationPicker";
import { destinationBadges } from "../ui/destinationBadges";
import { MatchedPairs } from "../ui/MatchedPairs";
import { restatesQuestion } from "../ui/questionReason";
import { QuestionRow } from "../ui/QuestionRow";
import { VerdictChip } from "../ui/VerdictChip";

export interface JudgePageProps {
  edition: RuleEdition;
  index: readonly DestinationIndexEntry[];
  today: string;
  now?: () => number;
  // A tracked record of the app's own read on Chrome's built-in model (src/judge/recordedReads.ts), or none.
  recorded?: RecordedReads | null;
  // Matched pairs (src/judge/matchedPairs.ts); none shows until the project owner's photos are listed.
  pairs?: readonly MatchedPair[];
  // The live read's real parts. By default they load only when its button is pressed, so the page itself
  // makes no request to Google.
  liveRead?: () => Promise<LiveReadDeps>;
}

const PHOTO_ALT = new Map(manifest.items.map((i) => [i.itemId, i.alt]));

// A card's photo: its small WebP copy at its own size, so the page loads fast and nothing shifts as photos arrive.
function CardPhoto({ itemId, photo, alt }: { itemId: string; photo: string; alt: string }) {
  const t = thumbOf(itemId);
  if (!t) return <img src={photo} alt={alt} loading="lazy" />;
  return <img src={t.src} srcSet={t.srcSet} sizes="(max-width: 700px) 50vw, 240px" width={t.width} height={t.height} alt={alt} loading="lazy" decoding="async" />;
}

function sampleStore(edition: RuleEdition, today: string, now: () => number): BoxStore {
  const store = createBoxStore({ edition: () => edition, persistence: noPersistence(), now, today: () => today,
    newId: () => crypto.randomUUID(), boxId: "sample" });
  for (const s of SAMPLE_BOX) {
    const item: BoxItem = {
      itemId: s.itemId, read: s.read, overrides: {}, answers: {}, quantity: 1, identityConfirmedBy: "sender",
      labelTags: labelTagsOf(s.read.labelText, edition), readSource: "manual", readMs: 0, secondLook: null, cropKey: null,
      customs: { description: "", lintOk: false, weightOz: null, valueUsd: null, countryOfOrigin: null, upc: null },
    };
    store.mergeRemoteItem(item);
  }
  return store;
}

const loadLiveRead = () => import("../judge/liveReadDeps").then((m) => m.loadLiveReadDeps());

export function JudgePage({ edition, index, today, now = () => performance.now(), recorded = null, pairs = MATCHED_PAIRS, liveRead = loadLiveRead }: JudgePageProps) {
  const [store] = useState(() => sampleStore(edition, today, now));
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const readBy = Object.fromEntries(index.flatMap((d) => {
    const r = rulesReadBy(resolveDestination(edition, d.code));
    return r ? [[d.code, r.by] as const] : [];
  }));
  const country = index.find((d) => d.code === state.destinationCode)?.name ?? state.destinationCode;
  const dest = state.result.destination;
  // The live read's item, judged alone by the app's rules for the country picked now.
  const judgeLive = (read: ItemRead) => evaluateBox([{ itemId: "live-read", read, overrides: {}, answers: {}, quantity: 1, identityConfirmedBy: null,
    labelTags: labelTagsOf(read.labelText, edition) }], edition, dest, today).items["live-read"]!.level;
  // A suspension the post office has announced, for a country a judge can pick: the rules follow USPS.
  const examples = (edition.suspensions.upcoming ?? []).flatMap((u) => {
    const name = index.find((d) => d.code === u.code)?.name;
    if (!name) return [];
    const verb = today >= u.from ? "stopped" : "stops";
    return [`USPS ${verb} taking mail to ${name} on ${longDate(u.from)}. Pick ${name} to see the app say so.`];
  });
  const byId = new Map(SAMPLE_BOX.map((s) => [s.itemId, s]));

  return (
    <div className="judge">
      <h1>Try the sample box</h1>
      <p>
        Nine real items from our test photos. We typed in what each label says, so this page needs no camera, no built-in
        model and no sign-in. The app's own rules decide each verdict, here in your browser.
      </p>
      <p>
        <a href="/">Check your own box</a> · <a href={SOURCE_URL} target="_blank" rel="noreferrer">Source code on GitHub</a>
        {" · "}<a href={ANDROID_RELEASE_URL} target="_blank" rel="noreferrer">Android app (APK)</a>
        {" · "}<a href="#live-read">Run one live read</a>
      </p>
      <p data-testid="cloud-settings-note">If your browser blocks Firebase settings, cloud checks stay off. Checks on this device still work.</p>
      {examples.map((text) => <p key={text} data-testid="suspension-example">{text}</p>)}
      <DestinationPicker index={index} readBy={readBy} value={state.destinationCode} onChange={(code) => store.setDestination(code)}
        badges={destinationBadges(edition, index.map((d) => d.code), today)} />
      <MatchedPairs pairs={pairs} edition={edition} destinationCode={state.destinationCode} today={today} />
      {!dest.suspended && dest.suspendsFrom && (
        <p data-testid="suspension-ahead-banner" className="banner" role="status">
          The post office stops taking mail to {country} on {longDate(dest.suspendsFrom)}. Mail this box before then.
        </p>
      )}
      <BoxSummary result={state.result} itemCount={state.items.length} limits={edition.limits}
        recheck={state.lastRecheckMs === null ? null : { ms: Math.round(state.lastRecheckMs), country }} />
      <div data-testid="sample-grid" className="sample-grid">
      {state.items.map((item) => {
        const sample = byId.get(item.itemId);
        const verdict = state.result.items[item.itemId];
        if (!sample || !verdict) return null;
        return (
          <article key={item.itemId} data-testid="sample-card" className="card sample-card">
            <div className="sample-photo">
              <CardPhoto itemId={item.itemId} photo={sample.photo} alt={sample.alt} />
              <VerdictChip level={verdict.level} />
            </div>
            <p className="item-name">{item.read.itemName}</p>
            {verdict.hits.filter((h) => h.level !== "note" && !restatesQuestion(h.text, verdict.question)).map((h) => (
              <p key={h.ruleId}>{h.text} <a href={h.url} target="_blank" rel="noreferrer">{h.section}</a></p>
            ))}
            {verdict.question && (
              <QuestionRow question={verdict.question} value={item.answers[verdict.question.id]}
                onAnswer={(q, a) => store.answer(item.itemId, q, a)} />
            )}
            <details className="sample-more">
              <summary>Label and photo credit</summary>
              {item.read.labelText && <p className="label-words">Label: {item.read.labelText}</p>}
              <p className="credit">{sample.credit}</p>
            </details>
          </article>
        );
      })}
      </div>
      <LiveReadPanel load={liveRead} judge={judgeLive} country={country} />
      {recorded && (
        <details data-testid="recorded-reads" className="recorded-reads">
          <summary>Recorded on-device reads</summary>
          <p>
            Recorded {longDate(recorded.ranAt.slice(0, 10))}, Chrome {recorded.chromeVersion} on {recorded.os}
            {recorded.machine ? `, ${recorded.machine.chip}, ${recorded.machine.memoryGb} GB memory (${recorded.machine.model})` : ""}. A replay, not a live read.
            The app's own read ran on Chrome's built-in model, with no call to the cloud model.
          </p>
          <ul>
            {recorded.reads.map((r, i) => (
              <li key={r.itemId}>
                {PHOTO_ALT.get(r.itemId) ?? r.itemId}: read as {r.category ? CATEGORY_LABELS[r.category as ItemCategory] ?? r.category : "no category"}, in{" "}
                {r.ms.toLocaleString("en-US")} ms{i === 0 ? " (first read, includes the model's start)" : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
