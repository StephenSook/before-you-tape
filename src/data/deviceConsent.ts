// The sender's cloud answer on this device only, kept in this browser's storage and never synced: each
// device asks its own question. It is read right before every call that can reach the cloud, and another
// tab's change arrives as a storage event, which aborts work that has not been sent.
// The question now covers the cloud's second look, so it is versioned: a yes to the earlier question, which
// did not mention it, counts as unanswered and is asked again. A no under the earlier key always counts, so a
// tab still on the earlier version can take consent back.
const KEY = "byt.cloudConsent.v2";
const EARLIER_KEY = "byt.cloudConsent";

export interface DeviceConsent {
  get(): boolean | null;
  set(v: boolean | null): void;
  onChange(f: (v: boolean | null) => void): () => void;
}

const parse = (raw: string | null): boolean | null => (raw === "true" ? true : raw === "false" ? false : null);

export function deviceConsent(storage: Storage): DeviceConsent {
  // With storage blocked the answer lasts for this visit, and starts unanswered.
  let blocked = false;
  let memory: boolean | null = null;
  const get = () => {
    if (blocked) return memory;
    try {
      if (parse(storage.getItem(EARLIER_KEY)) === false) return false;
      return parse(storage.getItem(KEY));
    } catch {
      blocked = true;
      return memory;
    }
  };
  return {
    get,
    set(v) {
      memory = v;
      if (blocked) return;
      try {
        storage.removeItem(EARLIER_KEY);
        if (v === null) storage.removeItem(KEY);
        else storage.setItem(KEY, String(v));
      } catch {
        blocked = true;
      }
    },
    onChange(f) {
      if (typeof window === "undefined") return () => {};
      const onStorage = (e: StorageEvent) => { if (e.key === KEY || e.key === EARLIER_KEY || e.key === null) f(get()); };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
  };
}
