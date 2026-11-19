// The model's own item names, kept in this browser's storage while the server has only category names
// (before cloud consent), so a reload on this device shows the real names again.
import type { DeviceNames } from "./boxStore";

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
        return Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === "string"));
      } catch {
        return {};
      }
    },
  };
}
