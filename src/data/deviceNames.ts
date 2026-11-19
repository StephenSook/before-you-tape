// Items' own names (the read's and the sender's correction), kept in this browser's storage: the server has
// only category labels, so a reload on this device shows the real names again.
import type { DeviceNames, ItemNames } from "./boxStore";

const KEY = (boxId: string) => `byt.names.${boxId}`;

export function deviceNames(storage: Storage): DeviceNames {
  return {
    remember(boxId, names) {
      try {
        storage.setItem(KEY(boxId), JSON.stringify(names));
      } catch {
        // Storage full or blocked: the names last for this visit.
      }
    },
    recall(boxId) {
      try {
        const v: unknown = JSON.parse(storage.getItem(KEY(boxId)) ?? "{}");
        if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
        const out: Record<string, ItemNames> = {};
        for (const [id, n] of Object.entries(v)) {
          if (typeof n !== "object" || n === null || typeof (n as { read?: unknown }).read !== "string") continue;
          const { read, override } = n as { read: string; override?: unknown };
          out[id] = typeof override === "string" ? { read, override } : { read };
        }
        return out;
      } catch {
        return {};
      }
    },
  };
}
