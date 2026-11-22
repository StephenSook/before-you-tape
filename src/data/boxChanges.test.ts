import { afterEach, describe, expect, it, vi } from "vitest";
import { boxChanges } from "./boxChanges";

describe("boxChanges", () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it("tells every other tab on the same box, never the tab that wrote, and no tab on another box", async () => {
    const a = boxChanges("box-1", localStorage);
    const b = boxChanges("box-1", localStorage);
    const other = boxChanges("box-2", localStorage);
    const heardA = vi.fn();
    const heardB = vi.fn();
    const heardOther = vi.fn();
    const stops = [a.onChange(heardA), b.onChange(heardB), other.onChange(heardOther)];
    a.announce();
    await vi.waitFor(() => expect(heardB).toHaveBeenCalledTimes(1));
    expect(heardA).not.toHaveBeenCalled();
    expect(heardOther).not.toHaveBeenCalled();
    for (const stop of stops) stop();
    for (const c of [a, b, other]) c.close();
  });

  // A browser without BroadcastChannel hears another tab through the storage event, which never fires in the tab
  // that wrote.
  it("falls back to the storage event without BroadcastChannel", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const a = boxChanges("box-1", localStorage);
    const heard = vi.fn();
    const stop = a.onChange(heard);
    a.announce();
    const key = Object.keys(localStorage).find((k) => k.includes("box-1"));
    expect(key).toBeDefined();
    window.dispatchEvent(new StorageEvent("storage", { key: key!, newValue: localStorage.getItem(key!) }));
    expect(heard).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new StorageEvent("storage", { key: "byt.something-else", newValue: "1" }));
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    window.dispatchEvent(new StorageEvent("storage", { key: key!, newValue: "2" }));
    expect(heard).toHaveBeenCalledTimes(1);
  });

  // Two tabs writing in the same millisecond must still change the value, or the second fires no storage event.
  it("writes a new value each time, even from two tabs in the same millisecond", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const key = "byt.boxChanged.box-1";
    boxChanges("box-1", localStorage).announce();
    const first = localStorage.getItem(key);
    boxChanges("box-1", localStorage).announce();
    expect(localStorage.getItem(key)).not.toBe(first);
    vi.restoreAllMocks();
  });

  it("never throws when storage is blocked", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const blocked = { setItem: () => { throw new Error("blocked"); } } as unknown as Storage;
    expect(() => boxChanges("box-1", blocked).announce()).not.toThrow();
  });
});
