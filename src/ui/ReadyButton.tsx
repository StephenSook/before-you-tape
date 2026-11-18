// The on-device model's state. "Get this laptop ready" starts the download, which Chrome only allows from a
// click; the progress bar shows the real download, never a made-up one.
import type { GateState } from "../ai/port";

export function ReadyButton({ gate, progress, onReady }: { gate: GateState; progress: number | null; onReady: () => void }) {
  if (gate === "downloadable") return <button type="button" data-testid="ready-button" onClick={onReady}>Get this laptop ready</button>;
  if (gate === "downloading") {
    const pct = Math.round((progress ?? 0) * 100);
    return <div role="progressbar" aria-label="Getting this laptop ready" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>Getting this laptop ready: {pct}%</div>;
  }
  if (gate === "available") return <p>This laptop checks items itself.</p>;
  return <p>This device checks items in the cloud.</p>;
}
