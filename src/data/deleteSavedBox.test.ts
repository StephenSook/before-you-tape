import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalBox, deleteSavedBox, leaveDeletedBox, rememberDeleted, savedBoxDeleter, takeDeletedNotice, whenDeletedElsewhere, type DeleteSavedBoxDeps, type DeleterParts } from "./deleteSavedBox";

const deps = (over: Partial<DeleteSavedBoxDeps> = {}) => {
  const order: string[] = [];
  const d: DeleteSavedBoxDeps = {
    stopSaving: vi.fn(async () => { order.push("stop"); }),
    resumeSaving: vi.fn(() => { order.push("resume"); }),
    deleteBox: vi.fn(async () => { order.push("box"); }),
    deleteCrops: vi.fn(async () => { order.push("crops"); }),
    clearLocal: vi.fn(() => { order.push("local"); }),
    deleteSignIn: vi.fn(async () => { order.push("signIn"); }),
    signOut: vi.fn(async () => { order.push("signOut"); }),
    ...over,
  };
  return { d, order };
};

describe("deleteSavedBox", () => {
  it("stops this page saving, then deletes the saved box, this device's crops, the anonymous sign-in, then this browser's keys", async () => {
    const { d, order } = deps();
    expect(await deleteSavedBox("b1", d)).toEqual({ ok: true, signIn: "deleted" });
    expect(order).toEqual(["stop", "box", "crops", "signIn", "local"]);
    expect(d.deleteBox).toHaveBeenCalledWith("b1");
    expect(d.clearLocal).toHaveBeenCalledWith("b1");
  });

  it("stops at the first step that fails and says which, leaving the later steps undone", async () => {
    const { d, order } = deps({ deleteBox: vi.fn(async () => { throw new Error("offline"); }) });
    expect(await deleteSavedBox("b1", d)).toEqual({ ok: false, stoppedAt: "box" });
    // The box is still there, so this page saves again.
    expect(order).toEqual(["stop", "resume"]);
  });

  it("signs out when the anonymous sign-in cannot be deleted without signing in again", async () => {
    const recent = Object.assign(new Error("requires recent login"), { code: "auth/requires-recent-login" });
    const { d, order } = deps({ deleteSignIn: vi.fn(async () => { throw recent; }) });
    expect(await deleteSavedBox("b1", d)).toEqual({ ok: true, signIn: "signed_out" });
    expect(order).toEqual(["stop", "box", "crops", "signOut", "local"]);
  });

  it("does not say signed out when signing out fails too", async () => {
    const recent = Object.assign(new Error("requires recent login"), { code: "auth/requires-recent-login" });
    const { d } = deps({ deleteSignIn: vi.fn(async () => { throw recent; }), signOut: vi.fn(async () => { throw new Error("x"); }) });
    expect(await deleteSavedBox("b1", d)).toEqual({ ok: false, stoppedAt: "signIn" });
  });

  it("starts a retry at the step that stopped, so the steps already done are not run again", async () => {
    const { d, order } = deps();
    expect(await deleteSavedBox("b1", d, "signIn")).toEqual({ ok: true, signIn: "deleted" });
    expect(order).toEqual(["signIn", "local"]);
    const again = deps();
    await deleteSavedBox("b1", again.d, "crops");
    expect(again.order).toEqual(["crops", "signIn", "local"]);
  });

  // Taking away the pointer to the box tells other tabs to start again; they must not before the sign-in is gone, or
  // they would save a new box under it.
  it("keeps this browser's keys until the sign-in is gone", async () => {
    const { d, order } = deps({ deleteSignIn: vi.fn(async () => { throw new Error("network"); }) });
    expect(await deleteSavedBox("b1", d)).toEqual({ ok: false, stoppedAt: "signIn" });
    // The box is gone, so this page does not save again.
    expect(order).toEqual(["stop", "box", "crops"]);
    expect(d.clearLocal).not.toHaveBeenCalled();
  });

  it("finishes in a browser that refuses its storage, which then holds nothing to remove", async () => {
    const { d } = deps({ clearLocal: vi.fn(() => { throw new Error("SecurityError"); }) });
    expect(await deleteSavedBox("b1", d)).toEqual({ ok: true, signIn: "deleted" });
  });

  it("says the sign-in step failed for any other sign-in error", async () => {
    const { d } = deps({ deleteSignIn: vi.fn(async () => { throw new Error("network"); }) });
    expect(await deleteSavedBox("b1", d)).toEqual({ ok: false, stoppedAt: "signIn" });
  });
});

describe("clearLocalBox", () => {
  beforeEach(() => localStorage.clear());

  it("removes the box's own keys in this browser and keeps the device's cloud answer and other boxes", () => {
    for (const k of ["byt.box.b1", "byt.journal.b1", "byt.names.b1", "byt.currentBox", "byt.box.b2", "byt.cloudConsent.v2"]) localStorage.setItem(k, "x");
    localStorage.setItem("byt.currentBox", "b1");
    clearLocalBox(localStorage, "b1");
    expect(Object.keys(localStorage).sort()).toEqual(["byt.box.b2", "byt.cloudConsent.v2"]);
  });

  it("keeps the pointer to the current box when it names another box", () => {
    localStorage.setItem("byt.currentBox", "b2");
    clearLocalBox(localStorage, "b1");
    expect(localStorage.getItem("byt.currentBox")).toBe("b2");
  });
});

describe("the notice after a delete", () => {
  beforeEach(() => sessionStorage.clear());

  it("is kept across the reload that starts a new box, and shown only once", () => {
    rememberDeleted(sessionStorage, "signed_out");
    expect(takeDeletedNotice(sessionStorage)).toBe("signed_out");
    expect(takeDeletedNotice(sessionStorage)).toBeNull();
  });

  it("ignores anything else stored under its key", () => {
    sessionStorage.setItem("byt.deleted", "something");
    expect(takeDeletedNotice(sessionStorage)).toBeNull();
  });
});

describe("savedBoxDeleter", () => {
  beforeEach(() => localStorage.clear());
  const parts = (over: Partial<DeleterParts> = {}) => {
    const p: DeleterParts = {
      store: { getState: () => ({ boxId: "b1" }), close: vi.fn(async () => {}), reopen: vi.fn() },
      signedIn: Promise.resolve(),
      currentUid: () => "alice",
      deleteFirestoreBox: vi.fn(async () => {}),
      deleteCropsExcept: vi.fn(async () => 0),
      storage: localStorage,
      deleteSignIn: vi.fn(async () => {}),
      signOut: vi.fn(async () => {}),
      ...over,
    };
    return p;
  };

  it("deletes the box in Firestore under whoever is signed in now, even on a page that fell back to this browser", async () => {
    // A page whose own sign-in failed: another tab signed in since, under the same account, and saved the box.
    const p = parts({ signedIn: Promise.reject(new Error("offline")) });
    expect(await savedBoxDeleter(p)()).toEqual({ ok: true, signIn: "deleted" });
    expect(p.store.close).toHaveBeenCalled();
    expect(p.deleteFirestoreBox).toHaveBeenCalledWith("alice", "b1");
  });

  it("has nothing in Firestore to delete when no one is signed in", async () => {
    const p = parts({ currentUid: () => null });
    await savedBoxDeleter(p)();
    expect(p.deleteFirestoreBox).not.toHaveBeenCalled();
  });

  // No other box can start on this device before the delete ends (the pointer goes last), so every crop here is
  // this box's, a photo another tab added since this page last looked included.
  it("deletes every crop on this device", async () => {
    const p = parts();
    await savedBoxDeleter(p)();
    const keep = vi.mocked(p.deleteCropsExcept).mock.calls[0]![0];
    expect(keep("c1")).toBe(false);
    expect(keep("added-in-another-tab")).toBe(false);
  });
});

describe("whenDeletedElsewhere", () => {
  const change = (key: string | null, oldValue: string | null, newValue: string | null) =>
    window.dispatchEvent(new StorageEvent("storage", { key, oldValue, newValue, storageArea: localStorage }));

  it("tells this tab once another tab's delete takes away the pointer to its box, and not for any other change", () => {
    const gone = vi.fn();
    const stop = whenDeletedElsewhere(window, "b1", gone);
    change("byt.currentBox", null, "b1");
    change("byt.journal.b1", "x", null);
    change("byt.currentBox", "b2", null);
    expect(gone).not.toHaveBeenCalled();
    change("byt.currentBox", "b1", null);
    expect(gone).toHaveBeenCalledTimes(1);
    change(null, null, null);
    expect(gone).toHaveBeenCalledTimes(1);
    stop();
  });

  it("counts this browser's storage being cleared in another tab", () => {
    const gone = vi.fn();
    const stop = whenDeletedElsewhere(window, "b1", gone);
    change(null, null, null);
    expect(gone).toHaveBeenCalledTimes(1);
    stop();
    change("byt.currentBox", "b1", null);
    expect(gone).toHaveBeenCalledTimes(1);
  });
});

describe("leaveDeletedBox", () => {
  beforeEach(() => localStorage.clear());

  it("stops saving, removes what a write still on its way put back in this browser, then starts again", async () => {
    const order: string[] = [];
    // A write of the old box that lands while the store closes.
    const store = { close: vi.fn(async () => { localStorage.setItem("byt.journal.b1", "{}"); localStorage.setItem("byt.box.b1", "{}"); order.push("closed"); }) };
    await leaveDeletedBox(store, localStorage, "b1", () => order.push("reload"));
    expect(order).toEqual(["closed", "reload"]);
    expect(localStorage.getItem("byt.journal.b1")).toBeNull();
    expect(localStorage.getItem("byt.box.b1")).toBeNull();
  });
});
