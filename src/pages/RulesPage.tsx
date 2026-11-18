// /rules: every rule the app applies, in our words, with where it comes from. Read straight from the rule
// edition the app runs, so this page and the verdicts cannot drift apart.
import { resolveDestination } from "../engine/edition";
import { rulesReadBy } from "../engine/layers";
import type { RuleEdition } from "../engine/types";
import type { DestinationIndexEntry } from "../ui/DestinationPicker";

const OUTCOME: Record<string, string> = { take_out: "Take it out", check: "Check this", ok: "OK to pack" };

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function RulesPage({ edition, index }: { edition: RuleEdition; index: readonly DestinationIndexEntry[] }) {
  const usps = edition.sources.find((s) => s.id === "usps_export");
  const seen = new Set<string>();
  const exportRules = edition.rules.filter((r) => r.layer === "usps_export" && !seen.has(r.id) && seen.add(r.id));
  return (
    <main className="rules">
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
        const lines = dest.edition?.lines ?? [];
        return (
          <section key={d.code} aria-labelledby={`dest-${d.code}`}>
            <h2 id={`dest-${d.code}`}>{d.name}</h2>
            <p>
              {readBy?.by === "person" ? `Checked by a person on ${readBy.on}.`
                : readBy ? `Rules read from the USPS page on ${readBy.on}, not yet checked by a person.`
                : "We have not read this country's rules yet."}{" "}
              <a href={d.immUrl} target="_blank" rel="noreferrer">{d.name} listing</a>
            </p>
            <ul aria-label={`${d.name} rules`}>
              {lines.map((l) => <li key={l.lineId}>{l.ourWording}</li>)}
            </ul>
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
      </section>
    </main>
  );
}
