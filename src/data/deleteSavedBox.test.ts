import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotBoxOwner } from "./boxOps";
import { clearLocalBox, deleteSavedBox, leaveDeletedBox, rememberDeleted, savedBoxDeleter, takeDeletedNotice, whenDeletedElsewhere, type DeleteSavedBoxDeps, type DeleterParts } from "./deleteSavedBox";

const deps = (over: Partial<DeleteSavedBoxDeps> = {}) => {
  const order: string[] = [];
  const d: DeleteSavedBoxDeps = {
    stopSaving: vi.fn(async () => { order.push("stop"); }),
    resumeSaving: vi.fn(() => { order.push("resume"); }),
    deleteBox: vi.fn(async () => { order.push("box"); return { ownerUid: "alice", cropKeys: ["c2"] }; }),
    deleteCrops: vi.fn<(keys: string[]) => Promise<void>>(async () => { order.push("crops"); }),
    currentUid: () => "alice",
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
    expect(d.deleteCrops).toHaveBeenCalledWith(["c2"]);
    expect(d.clearLocal).toHaveBeenCalledWith("b1");
  });

  // Another tab may have signed in since as the owner of a newer box; that sign-in is not this box's to delete.
  it("keeps the sign-in when it is not the one that owned the box", async () => {
    const { d, order } = deps({ currentUid: () => "bob" });
    expect(await deleteSavedBox("b1", d)).toEqual({ ok: true, signIn: "kept" });
    expect(order).toEqual(["stop", "box", "crops", "local"]);
    expect(d.deleteSignIn).not.toHaveBeenCalled();
  });

  it("keeps the sign-in when no box was in Firestore for it to own", async () => {
    const { d } = deps({ deleteBox: vi.fn(async () => ({ ownerUid: null, cropKeys: [] })) });
    expect(await deleteSavedBox("b1", d)).toEqual({ ok: true, signIn: "kept" });
    expect(d.deleteSignIn).not.toHaveBeenCalled();
  });

  it("stops at the first step that fails and says which, leaving the later steps undone", async () => {
    const { d, order } = deps({ deleteBox: vi.fn(async () => { throw new Error("offline"); }) });
    expect(await deleteSavedBox("b1", d)).toEqual({ ok: false, stoppedAt: "box" });
    // The box is still there, so this page saves again.
    expect(order).toEqual(["stop", "resume"]);
  });

  it("refuses, changing nothing, when this sign-in does not own the box", async () => {
    const { d, order } = deps({ deleteBox: vi.fn(async () => { throw new NotBoxOwner(); }) });
    expect(await deleteSavedBox("b1", d)).toEqual({ ok: false, offline: true });
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
    expect(await deleteSavedBox("b1", d, "signIn", { ownerUid: "alice", cropKeys: [] })).toEqual({ ok: true, signIn: "deleted" });
    expect(order).toEqual(["signIn", "local"]);
    const again = deps();
    await deleteSavedBox("b1", again.d, "crops", { ownerUid: "alice", cropKeys: ["c9"] });
    expect(again.order).toEqual(["crops", "signIn", "local"]);
    expect(again.d.deleteCrops).toHaveBeenCalledWith(["c9"]);
    // A retry that does not know whose the box was keeps the sign-in.
    expect(await deleteSavedBox("b1", deps().d, "signIn")).toEqual({ ok: true, signIn: "kept" });
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
    rememberDeleted(sessionStorage, "kept");
    expect(takeDeletedNotice(sessionStorage)).toBe("kept");
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
      store: { getState: () => ({ boxId: "b1", items: [{ cropKey: "c1" }, { cropKey: null }] }), close: vi.fn(async () => {}), reopen: vi.fn() },
      signedIn: Promise.resolve(),
      currentUid: () => "alice",
      deleteFirestoreBox: vi.fn(async () => ({ ownerUid: "alice", cropKeys: ["c3"] })),
      deleteCrop: vi.fn(async () => {}),
      storage: localStorage,
      deleteSignIn: vi.fn(async () => {}),
      signOut: vi.fn(async () => {}),
      onStale: vi.fn(),
      online: () => true,
      ...over,
    };
    return p;
  };

  it("deletes the box in Firestore under whoever is signed in now, even on a page whose own sign-in failed", async () => {
    // A page whose own sign-in failed: another tab signed in since, under the same account, and saved the box.
    const p = parts({ signedIn: Promise.reject(new Error("offline")) });
    expect(await savedBoxDeleter(p)()).toEqual({ ok: true, signIn: "deleted" });
    expect(p.store.close).toHaveBeenCalled();
    expect(p.deleteFirestoreBox).toHaveBeenCalledWith("alice", "b1");
  });

  it("deletes nothing from a tab whose box was deleted elsewhere while it missed the news, and leaves that box", async () => {
    localStorage.setItem("byt.currentBox", "b2");
    const p = parts();
    expect(await savedBoxDeleter(p)()).toEqual({ ok: false, stoppedAt: "box" });
    expect(p.onStale).toHaveBeenCalled();
    for (const f of [p.store.close, p.deleteFirestoreBox, p.deleteCrop, p.deleteSignIn, p.signOut]) expect(f).not.toHaveBeenCalled();
  });

  it("deletes when the pointer names this box, or when this browser keeps no pointer", async () => {
    localStorage.setItem("byt.currentBox", "b1");
    const named = parts();
    expect(await savedBoxDeleter(named)()).toEqual({ ok: true, signIn: "deleted" });
    localStorage.clear();
    const none = parts();
    expect(await savedBoxDeleter(none)()).toEqual({ ok: true, signIn: "deleted" });
    expect(none.onStale).not.toHaveBeenCalled();
  });

  // A delete it cannot confirm is never claimed: offline, or with no Firebase session, nothing is touched.
  it("refuses, changing nothing, when this page is offline or has no Firebase session", async () => {
    localStorage.setItem("byt.journal.b1", "{}");
    for (const p of [parts({ online: () => false }), parts({ currentUid: () => null })]) {
      expect(await savedBoxDeleter(p)()).toEqual({ ok: false, offline: true });
      for (const f of [p.store.close, p.deleteFirestoreBox, p.deleteCrop, p.deleteSignIn, p.signOut]) expect(f).not.toHaveBeenCalled();
    }
    expect(localStorage.getItem("byt.journal.b1")).toBe("{}");
  });

  // Never every crop on the device: another box may have started here since, and its photos are not this box's.
  it("deletes only this box's crops: its items' on this page and those Firestore held for it", async () => {
    const p = parts();
    await savedBoxDeleter(p)();
    expect(vi.mocked(p.deleteCrop).mock.calls.map(([k]) => k).sort()).toEqual(["c1", "c3"]);
  });

  it("retries with what the delete found, so a later sign-in step still knows whose the box was", async () => {
    const deleteSignIn = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce();
    const p = parts({ deleteSignIn });
    const run = savedBoxDeleter(p);
    expect(await run()).toEqual({ ok: false, stoppedAt: "signIn" });
    expect(await run("signIn")).toEqual({ ok: true, signIn: "deleted" });
    expect(p.deleteFirestoreBox).toHaveBeenCalledTimes(1);
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
