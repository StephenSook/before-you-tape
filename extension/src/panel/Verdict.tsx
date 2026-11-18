import type { ItemVerdict, VerdictLevel } from "../../../src/engine/types";
import { buyLine } from "../check";

const icons: Record<VerdictLevel, string> = { ok: "\u2713", check: "?", take_out: "\u00d7" };

interface VerdictProps {
  verdict: ItemVerdict;
  editionId: string;
  onAnswer(questionId: string, answerId: string): void;
}

export function Verdict({ verdict, editionId, onAnswer }: VerdictProps) {
  const { level, headline, hits, question, service } = verdict;
  return (
    <section className={`verdict verdict--${level}`} aria-labelledby="verdict-title">
      <h2 id="verdict-title"><span className="verdict-icon" aria-hidden="true">{icons[level]}</span> {headline}</h2>
      <p>{buyLine(level)}</p>
      {hits[0] && <p>{hits[0].text}</p>}
      {question && (
        <fieldset key={question.id}>
          <legend>{question.text}</legend>
          {question.answers.map(({ id, label }) => (
            <label key={id}>
              <input
                type="radio" name={question.id} value={id}
                onChange={() => onAnswer(question.id, id)}
              /> {label}
            </label>
          ))}
        </fieldset>
      )}
      <div className="verdict-meta">
        <div>{service}</div>
        <div><span aria-hidden="true">T</span> Typed by you</div>
        <div>Rules edition {editionId}</div>
      </div>
    </section>
  );
}
