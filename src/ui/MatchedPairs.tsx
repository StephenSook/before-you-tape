// Matched pairs, side by side: the app's own rules judge each side for the country picked on the page, and each
// side names the rule that decides it. Nothing shows until a real pair exists.
import { resolveDestination } from "../engine/edition";
import { labelTagsOf } from "../engine/facts";
import type { RuleEdition } from "../engine/types";
import { evaluateBox } from "../engine/verdict";
import type { MatchedPair, PairSide } from "../judge/matchedPairs";
import { VerdictChip } from "./VerdictChip";

export interface MatchedPairsProps { pairs: readonly MatchedPair[]; edition: RuleEdition; destinationCode: string; today: string }

function Side({ side, edition, destinationCode, today }: { side: PairSide } & Omit<MatchedPairsProps, "pairs">) {
  const item = { itemId: "pair", read: side.read, overrides: {}, answers: side.answers, quantity: 1, identityConfirmedBy: "sender" as const,
    labelTags: labelTagsOf(side.read.labelText, edition) };
  const code = side.destination ?? destinationCode;
  const verdict = evaluateBox([item], edition, resolveDestination(edition, code, undefined, today), today).items.pair!;
  const reason = verdict.hits.find((h) => h.level !== "note");
  return (
    <figure data-testid="pair-side" className="pair-side">
      <img src={side.photo} alt={side.photoAlt} width={side.width} height={side.height} loading="lazy" decoding="async" />
      <figcaption>
        <p className="pair-label">{side.label}</p>
        <VerdictChip level={verdict.level} />
        {reason && <p data-testid="pair-reason" className="pair-reason">{reason.text}</p>}
        <p className="credit">{side.credit}</p>
      </figcaption>
    </figure>
  );
}

export function MatchedPairs({ pairs, ...rest }: MatchedPairsProps) {
  if (pairs.length === 0) return null;
  return (
    <section aria-labelledby="pairs-heading" className="matched-pairs">
      <h2 id="pairs-heading">Same item, one thing different</h2>
      {pairs.map((p) => (
        <div key={p.id} data-testid="matched-pair" className="matched-pair">
          <h3>{p.title}</h3>
          <div className="pair-row">
            <Side side={p.left} {...rest} />
            <Side side={p.right} {...rest} />
          </div>
        </div>
      ))}
    </section>
  );
}
