// /rules: every rule the app applies, in our words, with where it comes from. Read straight from the rule
// edition the app runs, so this page and the verdicts cannot drift apart.
import { longDate } from "../engine/destination";
import { resolveDestination } from "../engine/edition";
import { rulesReadBy } from "../engine/layers";
import type { RuleEdition } from "../engine/types";
import committedCustoms from "../../rules/customs-authorities.json";
import { customsLinesFor, readCustomsAuthorities, type CustomsAuthority } from "../rules/customsAuthorities";
import committedReviews from "../../rules/reviews.json";
import { approvalOf, readReviews, type Reviews } from "../rules/reviews";
import { localDay } from "../shared/localDay";
import type { DestinationIndexEntry } from "../ui/DestinationPicker";

const OUTCOME: Record<string, string> = { take_out: "Take it out", check: "Check this", ok: "OK to pack" };

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

// What each country's own customs authority says about duty and tax, quoted word for word (rules/customs-authorities.json).
const CUSTOMS = readCustomsAuthorities(committedCustoms);
// Who checked each country's lines beyond our own reading (rules/reviews.json): AI reviews and an approval as a whole.
const REVIEWS = readReviews(committedReviews);

// customs and today: the authority lines to show (the committed ones unless a test passes its own) and this device's
// date, which decides whether they are still fresh.
export function RulesPage({ edition, index, customs = CUSTOMS, reviews = REVIEWS, today = localDay() }: {
  edition: RuleEdition; index: readonly DestinationIndexEntry[]; customs?: readonly CustomsAuthority[]; reviews?: Reviews; today?: string;
}) {
  const usps = edition.sources.find((s) => s.id === "usps_export");
  const seen = new Set<string>();
  const exportRules = edition.rules.filter((r) => r.layer === "usps_export" && !seen.has(r.id) && seen.add(r.id));
  return (
    <div className="rules">
      <h1>Rules</h1>
      <p>Every rule the app applies, in our words, with the section it comes from. Rule edition {edition.editionId}.</p>

      <section aria-labelledby="usps-heading">
        <h2 id="usps-heading">US Postal Service, international mail</h2>
        {usps && <p>From <a href={usps.url} target="_blank" rel="noreferrer">{usps.title}</a>, {usps.edition}, checked {usps.checkedOn}.</p>}
        <ul aria-label="US Postal Service rules">
          {exportRules.map((r) => (
            <li key={r.id}>
              <strong>{OUTCOME[r.outcome] ?? r.outcome}</strong>: {r.ourWording}{" "}
              <a href={r.url} target="_blank" rel="noreferrer">{r.section}</a>
            </li>
          ))}
        </ul>
      </section>

      {index.map((d) => {
        const dest = resolveDestination(edition, d.code);
        const readBy = rulesReadBy(dest);
        const approval = readBy?.by === "usps_page" ? approvalOf(reviews, d.code) : null;
        const lines = dest.edition?.lines ?? [];
        return (
          <section key={d.code} aria-labelledby={`dest-${d.code}`}>
            <h2 id={`dest-${d.code}`}>{d.name}</h2>
            <p>
              {readBy?.by === "person" ? `Checked by a person on ${readBy.on}.`
                : readBy && approval ? `Rules read from the USPS page on ${readBy.on}. Each line was checked against the USPS listing by two AI reviews, and approved by ${approval.personApprovedBy} on ${longDate(approval.personApprovedOn)}, as a whole, not line by line.`
                : readBy ? `Rules read from the USPS page on ${readBy.on}, not yet checked by a person.`
                : "We have not read this country's rules yet."}{" "}
              <a href={d.immUrl} target="_blank" rel="noreferrer">{d.name} listing</a>
            </p>
            <ul aria-label={`${d.name} rules`}>
              {lines.map((l) => <li key={l.lineId}>{l.ourWording}</li>)}
            </ul>
            <CustomsLines entry={customsLinesFor(customs, d.code, today, edition.limits.staleDays.customs)} />
          </section>
        );
      })}

      <section aria-labelledby="suspended-heading">
        <h2 id="suspended-heading">Suspended mail service</h2>
        <p>
          The post office is not taking mail to: {edition.suspensions.codes.map(countryName).join(", ")}. List updated{" "}
          {edition.suspensions.updated}, checked {edition.suspensions.checkedOn}.{" "}
          <a href={edition.suspensions.url} target="_blank" rel="noreferrer">Service alerts</a>
        </p>
        {(edition.suspensions.upcoming ?? []).map((u) => (
          <p key={u.code}>From {longDate(u.from)}, the post office will not take mail to: {countryName(u.code)}.</p>
        ))}
      </section>
    </div>
  );
}

function CustomsLines({ entry }: { entry: CustomsAuthority | null }) {
  if (!entry) return null;
  return (
    <details className="customs-lines">
      <summary>Duty and tax, from the {entry.authority}</summary>
      <ul>
        {entry.lines.map((l) => <li key={l.label}>{l.label}: "{l.quote}"</li>)}
      </ul>
      <p>
        Quoted from <a href={entry.url} target="_blank" rel="noreferrer">the {entry.authority} page</a>, read {entry.checkedOn}.
      </p>
    </details>
  );
}
