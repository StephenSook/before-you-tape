import { beforeEach, describe, expect, it, vi } from "vitest";
import { deviceConsent } from "./deviceConsent";

describe("deviceConsent", () => {
  beforeEach(() => localStorage.clear());

  it("keeps the answer in this browser, read back as true, false or unanswered", () => {
    const c = deviceConsent(localStorage);
    expect(c.get()).toBeNull();
    c.set(true);
    expect(deviceConsent(localStorage).get()).toBe(true);
    c.set(false);
    expect(c.get()).toBe(false);
    c.set(null);
    expect(c.get()).toBeNull();
    localStorage.setItem("byt.cloudConsent", "yes");
    expect(c.get()).toBeNull();
  });

  it("hears another tab's change to the answer, and only that key", () => {
    const c = deviceConsent(localStorage);
    const heard = vi.fn();
    const stop = c.onChange(heard);
    localStorage.setItem("byt.cloudConsent", "false");
    window.dispatchEvent(new StorageEvent("storage", { key: "byt.cloudConsent", newValue: "false" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "byt.box.b1", newValue: "{}" }));
    expect(heard.mock.calls).toEqual([[false]]);
    stop();
    window.dispatchEvent(new StorageEvent("storage", { key: "byt.cloudConsent", newValue: "true" }));
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("holds the answer for this visit when storage is blocked, and never says allowed on its own", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } } as unknown as Storage;
    const c = deviceConsent(blocked);
    expect(c.get()).toBeNull();
    c.set(true);
    expect(c.get()).toBe(true);
  });
});
