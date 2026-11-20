// /judge: a ready sample box a judge can try with no camera, no built-in model and no sign-in. Nine real items
// from the eval photo set, with what each label says typed in by us, judged by the app's own rules engine in
// the browser. Switching the country re-checks the whole box with no model call.
import { useState, useSyncExternalStore } from "react";
import { noPersistence } from "../data/boxOps";
import { createBoxStore, type BoxItem, type BoxStore } from "../data/boxStore";
import { longDate } from "../engine/destination";
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

export function JudgePage({ edition, index, today, now = () => performance.now() }: JudgePageProps) {
  const [store] = useState(() => sampleStore(edition, today, now));
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const readBy = Object.fromEntries(index.flatMap((d) => {
    const r = rulesReadBy(resolveDestination(edition, d.code));
    return r ? [[d.code, r.by] as const] : [];
  }));
  const country = index.find((d) => d.code === state.destinationCode)?.name ?? state.destinationCode;
  const dest = state.result.destination;
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
      <p><a href="/">Check your own box</a></p>
      <p data-testid="cloud-settings-note">If your browser blocks Firebase settings, cloud checks stay off. Checks on this device still work.</p>
      {examples.map((text) => <p key={text} data-testid="suspension-example">{text}</p>)}
      <DestinationPicker index={index} readBy={readBy} value={state.destinationCode} onChange={(code) => store.setDestination(code)} />
      {!dest.suspended && dest.suspendsFrom && (
        <p data-testid="suspension-ahead-banner" className="banner" role="status">
          The post office stops taking mail to {country} on {longDate(dest.suspendsFrom)}. Mail this box before then.
        </p>
      )}
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
    </div>
  );
}
