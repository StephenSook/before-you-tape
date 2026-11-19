// /judge: a ready sample box a judge can try with no camera, no built-in model and no sign-in. Nine real items
// from the eval photo set, with what each label says typed in by us, judged by the app's own rules engine in
// the browser. Switching the country re-checks the whole box with no model call.
import { useState, useSyncExternalStore } from "react";
import { createBoxStore, type BoxItem, type BoxStore } from "../data/boxStore";
import { resolveDestination } from "../engine/edition";
import { labelTagsOf } from "../engine/facts";
import { rulesReadBy } from "../engine/layers";
import type { RuleEdition } from "../engine/types";
import { SAMPLE_BOX } from "../judge/sampleBox";
import { BoxSummary } from "../ui/BoxSummary";
import { DestinationPicker, type DestinationIndexEntry } from "../ui/DestinationPicker";
import { QuestionRow } from "../ui/QuestionRow";
import { VerdictChip } from "../ui/VerdictChip";

export interface JudgePageProps {
  edition: RuleEdition;
  index: readonly DestinationIndexEntry[];
  today: string;
  now?: () => number;
}

function sampleStore(edition: RuleEdition, today: string, now: () => number): BoxStore {
  const store = createBoxStore({ edition: () => edition, persistence: { save: () => {}, load: async () => null }, now, today: () => today,
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

export function JudgePage({ edition, index, today, now = () => performance.now() }: JudgePageProps) {
  const [store] = useState(() => sampleStore(edition, today, now));
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const readBy = Object.fromEntries(index.flatMap((d) => {
    const r = rulesReadBy(resolveDestination(edition, d.code));
    return r ? [[d.code, r.by] as const] : [];
  }));
  const country = index.find((d) => d.code === state.destinationCode)?.name ?? state.destinationCode;
  const byId = new Map(SAMPLE_BOX.map((s) => [s.itemId, s]));

  return (
    <main className="judge">
      <h1>Try the sample box</h1>
      <p>
        Nine real items from our test photos. We typed in what each label says, so this page needs no camera, no built-in
        model and no sign-in. The app's own rules decide each verdict, here in your browser.
      </p>
      <p><a href="/">Check your own box</a></p>
      <p data-testid="cloud-settings-note">If your browser blocks Firebase settings, cloud checks stay off. Checks on this device still work.</p>
      <DestinationPicker index={index} readBy={readBy} value={state.destinationCode} onChange={(code) => store.setDestination(code)} />
      <BoxSummary result={state.result} itemCount={state.items.length} limits={edition.limits}
        recheck={state.lastRecheckMs === null ? null : { ms: Math.round(state.lastRecheckMs), country }} />
      {state.items.map((item) => {
        const sample = byId.get(item.itemId);
        const verdict = state.result.items[item.itemId];
        if (!sample || !verdict) return null;
        return (
          <article key={item.itemId} data-testid="sample-card" className="card sample-card">
            <img src={sample.photo} alt={sample.alt} loading="lazy" />
            <p className="item-name">{item.read.itemName}</p>
            {item.read.labelText && <p className="label-words">Label: {item.read.labelText}</p>}
            <VerdictChip level={verdict.level} />
            {verdict.hits.filter((h) => h.level !== "note").map((h) => (
              <p key={h.ruleId}>{h.text} <a href={h.url} target="_blank" rel="noreferrer">{h.section}</a></p>
            ))}
            {verdict.question && (
              <QuestionRow question={verdict.question} value={item.answers[verdict.question.id]}
                onAnswer={(q, a) => store.answer(item.itemId, q, a)} />
            )}
            <p className="credit">{sample.credit}</p>
          </article>
        );
      })}
    </main>
  );
}
