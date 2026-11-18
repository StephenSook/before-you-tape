// A verdict is never shown by colour alone: each chip carries its word, its own icon and its own pattern.
import type { VerdictLevel } from "../engine/types";

const WORD: Record<VerdictLevel, string> = { ok: "OK to pack", check: "Check this", take_out: "Take it out" };

function Icon({ level }: { level: VerdictLevel }) {
  const common = { role: "img", "aria-hidden": true, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  if (level === "ok") return <svg {...common}><path d="M4 12.5l5 5L20 6.5" /></svg>;
  if (level === "take_out") return <svg {...common}><path d="M6 6l12 12M18 6L6 18" /></svg>;
  return (
    <svg {...common} strokeWidth={2.5}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L21 21M8.7 8.8a2 2 0 1 1 2.6 1.9c-.6.2-.8.6-.8 1.1M10.5 13.6v.1" />
    </svg>
  );
}

export function VerdictChip({ level }: { level: VerdictLevel }) {
  return (
    <span data-testid="verdict-chip" className={`chip chip-${level}`}>
      <Icon level={level} />
      {WORD[level]}
    </span>
  );
}
