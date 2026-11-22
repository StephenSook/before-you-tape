// Tells this browser's other open tabs that the box changed, so a tab that read the box earlier stops calling it whole
// (BoxState.changedElsewhere). BroadcastChannel where the browser has it; otherwise a value written to storage, whose
// storage event reaches every other tab. Neither reaches the tab that wrote.
export interface BoxChanges {
  announce(): void;
  onChange(f: () => void): () => void;
  close(): void;
}

const NAME = (boxId: string) => `byt.boxChanged.${boxId}`;

export function boxChanges(boxId: string, storage: Storage): BoxChanges {
  const Channel = (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;
  if (typeof Channel === "function") {
    const channel = new Channel(NAME(boxId));
    return {
      announce() {
        try { channel.postMessage("changed"); } catch { /* closed: no tab is left to tell */ }
      },
      onChange(f) {
        const listener = () => f();
        channel.addEventListener("message", listener);
        return () => channel.removeEventListener("message", listener);
      },
      close: () => channel.close(),
    };
  }
  let sent = 0;
  return {
    announce() {
      // A new value each time, since an unchanged one fires no storage event: two tabs can write in the same
      // millisecond with the same count, so a random part keeps them apart.
      try { storage.setItem(NAME(boxId), `${Date.now()}-${++sent}-${Math.random().toString(36).slice(2)}`); } catch { /* storage blocked: other tabs are not told */ }
    },
    onChange(f) {
      if (typeof window === "undefined") return () => {};
      const onStorage = (e: StorageEvent) => { if (e.key === NAME(boxId)) f(); };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
    close: () => {},
  };
}
