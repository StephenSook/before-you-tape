// The on-device model's state. "Get this laptop ready" starts the download, which Chrome only allows from a
// click; the progress bar shows the real download, never a made-up one.
import type { GateState } from "../ai/port";

// cloudOn: the sender allowed cloud checks and they are not paused. Without them, a laptop that reads on its
// own keeps photos and label text to itself, and one that cannot says nothing here: a photo it cannot read
// says why when it is added.
export function ReadyButton({ gate, progress, onReady, cloudOn }: { gate: GateState; progress: number | null; onReady: () => void; cloudOn: boolean }) {
  if (gate === "checking") return null;
  if (gate === "downloadable") return <button type="button" data-testid="ready-button" onClick={onReady}>Get this laptop ready</button>;
  if (gate === "downloading") {
    const pct = Math.round((progress ?? 0) * 100);
    return <div role="progressbar" aria-label="Getting this laptop ready" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>Getting this laptop ready: {pct}%</div>;
  }
  if (gate === "available") return <p>{cloudOn ? "This laptop checks items itself." : "This laptop checks items itself. Photos and label text stay on it."}</p>;
  return cloudOn ? <p>This device checks items in the cloud.</p> : null;
}
