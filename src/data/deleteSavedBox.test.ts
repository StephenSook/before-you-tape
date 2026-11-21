import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalBox, deleteSavedBox, rememberDeleted, takeDeletedNotice, type DeleteSavedBoxDeps } from "./deleteSavedBox";

const deps = (over: Partial<DeleteSavedBoxDeps> = {}) => {
  const order: string[] = [];
  const d: DeleteSavedBoxDeps = {
    stopSaving: vi.fn(async () => { order.push("stop"); }),
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
  it("stops this page saving, then deletes the saved box, this device's crops and ids, then the anonymous sign-in", async () => {
    const { d, order } = deps();
    expect(await deleteSavedBox("b1", d)).toEqual({ ok: true, signIn: "deleted" });
    expect(order).toEqual(["stop", "box", "crops", "local", "signIn"]);
    expect(d.deleteBox).toHaveBeenCalledWith("b1");
    expect(d.clearLocal).toHaveBeenCalledWith("b1");
  });

  it("stops at the first step that fails and says which, leaving the later steps undone", async () => {
    const { d, order } = deps({ deleteBox: vi.fn(async () => { throw new Error("offline"); }) });
    expect(await deleteSavedBox("b1", d)).toEqual({ ok: false, stoppedAt: "box" });
    expect(order).toEqual(["stop"]);
  });

  it("signs out when the anonymous sign-in cannot be deleted without signing in again", async () => {
    const recent = Object.assign(new Error("requires recent login"), { code: "auth/requires-recent-login" });
    const { d, order } = deps({ deleteSignIn: vi.fn(async () => { throw recent; }) });
    expect(await deleteSavedBox("b1", d)).toEqual({ ok: true, signIn: "signed_out" });
    expect(order).toEqual(["stop", "box", "crops", "local", "signOut"]);
  });

  it("does not say signed out when signing out fails too", async () => {
    const recent = Object.assign(new Error("requires recent login"), { code: "auth/requires-recent-login" });
    const { d } = deps({ deleteSignIn: vi.fn(async () => { throw recent; }), signOut: vi.fn(async () => { throw new Error("x"); }) });
    expect(await deleteSavedBox("b1", d)).toEqual({ ok: false, stoppedAt: "signIn" });
  });

  it("starts a retry at the step that stopped, so the steps already done are not run again", async () => {
    const { d, order } = deps();
    expect(await deleteSavedBox("b1", d, "signIn")).toEqual({ ok: true, signIn: "deleted" });
    expect(order).toEqual(["signIn"]);
    const again = deps();
    await deleteSavedBox("b1", again.d, "crops");
    expect(again.order).toEqual(["crops", "local", "signIn"]);
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
