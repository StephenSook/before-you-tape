// Whether a new version of the app is installed and waiting. The service worker registration marks it ready with
// the call that switches to it; the page shows the update line and makes that call only when the visitor asks.
import { useSyncExternalStore } from "react";

let update: (() => Promise<void>) | null = null;
const listeners = new Set<() => void>();
const changed = () => { for (const l of listeners) l(); };

export function markUpdateReady(apply: () => Promise<void>): void {
  update = apply;
  changed();
}

// For tests: as if no new version had arrived.
export function forgetUpdate(): void {
  update = null;
  changed();
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function useWaitingUpdate(): (() => Promise<void>) | null {
  return useSyncExternalStore(subscribe, () => update, () => null);
}
