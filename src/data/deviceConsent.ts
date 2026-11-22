// The sender's cloud answer on this device only, kept in this browser's storage and never synced: each
// device asks its own question. It is read right before every call that can reach the cloud, and another
// tab's change arrives as a storage event, which aborts work that has not been sent.
// The question now covers the cloud's second look, so it is versioned: a yes to the earlier question, which
// did not mention it, counts as unanswered and is asked again. A no under the earlier key always counts, so a
// tab still on the earlier version can take consent back.
const KEY = "byt.cloudConsent.v2";
const EARLIER_KEY = "byt.cloudConsent";
// How many times a no was given on this device, in any tab: a photo read before the newest no never reaches the cloud,
// even after a new yes, and a tab that has not heard of that no yet still finds it here.
const NOS_KEY = "byt.cloudConsent.nos";

export interface DeviceConsent {
  get(): boolean | null;
  set(v: boolean | null): void;
  noCount(): number;
  onChange(f: (v: boolean | null) => void): () => void;
}

const parse = (raw: string | null): boolean | null => (raw === "true" ? true : raw === "false" ? false : null);

export function deviceConsent(storage: Storage): DeviceConsent {
  // With storage blocked the answer lasts for this visit, and starts unanswered.
  let blocked = false;
  let memory: boolean | null = null;
  let memoryNos = 0;
  const nosNow = () => {
    if (blocked) return memoryNos;
    try {
      const n = Number(storage.getItem(NOS_KEY) ?? "0");
      return Number.isInteger(n) && n >= 0 ? n : 0;
    } catch {
      return memoryNos;
    }
  };
  const countNo = () => {
    memoryNos = nosNow() + 1;
    try { storage.setItem(NOS_KEY, String(memoryNos)); } catch { /* counted for this visit */ }
  };
  // An earlier-version tab took consent back: the no is recorded under this key too, so a later yes from that
  // tab, to the earlier question, never brings consent back.
  const takeBack = () => {
    memory = false;
    countNo();
    // Storage that cannot be written still holds the earlier no, which is read again next time.
    try {
      storage.setItem(KEY, "false");
      storage.removeItem(EARLIER_KEY);
    } catch { /* still no */ }
    return false;
  };
  const get = () => {
    if (blocked) return memory;
    try {
      if (parse(storage.getItem(EARLIER_KEY)) === false) return takeBack();
      return parse(storage.getItem(KEY));
    } catch {
      blocked = true;
      return memory;
    }
  };
  return {
    get,
    noCount: nosNow,
    set(v) {
      if (v === false) countNo();
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
      // Each change is told with the value that event wrote, so a tab that hears an off and an on together
      // still hears the off.
      const onStorage = (e: StorageEvent) => {
        if (e.key === KEY && e.newValue !== null) { f(parse(e.newValue)); return; }
        if (e.key === EARLIER_KEY && parse(e.newValue) === false) {
          try { takeBack(); } catch { blocked = true; }
          f(false);
          return;
        }
        if (e.key === KEY || e.key === EARLIER_KEY || e.key === null) f(get());
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
  };
}
