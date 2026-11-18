// One question a clerk would ask, with its answers as buttons.
import type { Question } from "../engine/types";

export function QuestionRow({ question, value, onAnswer }: { question: Question; value: string | undefined; onAnswer: (questionId: string, answerId: string) => void }) {
  return (
    <div data-testid="question-row" role="group" aria-label={question.text}>
      <p>{question.text}</p>
      {question.answers.map((a) => (
        <button key={a.id} type="button" aria-pressed={value === a.id} onClick={() => onAnswer(question.id, a.id)}>
          {a.label}
        </button>
      ))}
    </div>
  );
}
