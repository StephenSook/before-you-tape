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
    localStorage.setItem("byt.cloudConsent.v2", "yes");
    expect(c.get()).toBeNull();
  });

  it("asks again anyone who said yes to the earlier question, which did not mention a second look, and keeps an earlier no", () => {
    localStorage.setItem("byt.cloudConsent", "true");
    expect(deviceConsent(localStorage).get()).toBeNull();
    localStorage.setItem("byt.cloudConsent", "false");
    expect(deviceConsent(localStorage).get()).toBe(false);
    // An answer to this question replaces the earlier one.
    deviceConsent(localStorage).set(true);
    expect(localStorage.getItem("byt.cloudConsent")).toBeNull();
    expect(localStorage.getItem("byt.cloudConsent.v2")).toBe("true");
    expect(deviceConsent(localStorage).get()).toBe(true);
    // A tab still on the earlier version can still take consent back, and its later yes never brings it back.
    localStorage.setItem("byt.cloudConsent", "false");
    expect(deviceConsent(localStorage).get()).toBe(false);
    expect(localStorage.getItem("byt.cloudConsent.v2")).toBe("false");
    localStorage.setItem("byt.cloudConsent", "true");
    expect(deviceConsent(localStorage).get()).toBe(false);
  });

  it("tells listeners each change another tab made, in order, even when only the last is still stored", () => {
    const c = deviceConsent(localStorage);
    const heard = vi.fn();
    const stop = c.onChange(heard);
    // A suspended tab hears an off and an on together, after both were written.
    localStorage.setItem("byt.cloudConsent.v2", "true");
    window.dispatchEvent(new StorageEvent("storage", { key: "byt.cloudConsent.v2", newValue: "false" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "byt.cloudConsent.v2", newValue: "true" }));
    expect(heard.mock.calls).toEqual([[false], [true]]);
    stop();
  });

  it("hears another tab's change to the answer, and only that key", () => {
    const c = deviceConsent(localStorage);
    const heard = vi.fn();
    const stop = c.onChange(heard);
    localStorage.setItem("byt.cloudConsent.v2", "false");
    window.dispatchEvent(new StorageEvent("storage", { key: "byt.cloudConsent.v2", newValue: "false" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "byt.box.b1", newValue: "{}" }));
    expect(heard.mock.calls).toEqual([[false]]);
    stop();
    window.dispatchEvent(new StorageEvent("storage", { key: "byt.cloudConsent.v2", newValue: "true" }));
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
