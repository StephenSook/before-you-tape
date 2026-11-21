import { afterEach, describe, expect, it, vi } from "vitest";
import { registerServiceWorker, type SwEnv } from "./register";
import { forgetUpdate, useWaitingUpdate } from "./update";
import { renderHook } from "@testing-library/react";

// A worker, a registration and a container that the test drives the way a browser would.
class FakeWorker extends EventTarget {
  state = "installing";
  posted: unknown[] = [];
  postMessage(m: unknown) { this.posted.push(m); }
  become(state: string) { this.state = state; this.dispatchEvent(new Event("statechange")); }
}
class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  update = vi.fn(async () => {});
  found(w: FakeWorker) { this.installing = w; this.dispatchEvent(new Event("updatefound")); }
}
class FakeContainer extends EventTarget {
  controller: object | null = null;
  registration = new FakeRegistration();
  register = vi.fn(async () => this.registration);
  takeOver() { this.controller = {}; this.dispatchEvent(new Event("controllerchange")); }
}

function env(controlled: boolean) {
  const container = new FakeContainer();
  if (controlled) container.controller = {};
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" as DocumentVisibilityState });
  const timers: (() => void)[] = [];
  const e: SwEnv = {
    container: container as unknown as ServiceWorkerContainer,
    document: doc as unknown as Document,
    reload: vi.fn(),
    every: (ms, f) => { expect(ms).toBe(3_600_000); timers.push(f); },
  };
  return { e, container, doc, timers };
}
const waiting = () => renderHook(() => useWaitingUpdate()).result;

afterEach(() => forgetUpdate());

describe("registerServiceWorker", () => {
  it("registers /sw.js for the whole site", async () => {
    const { e, container } = env(false);
    await registerServiceWorker(e);
    expect(container.register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("offers nothing and reloads nothing for the first worker, which only starts serving the page", async () => {
    const { e, container } = env(false);
    await registerServiceWorker(e);
    const w = new FakeWorker();
    container.registration.found(w);
    w.become("installed");
    container.takeOver();
    expect(waiting().current).toBeNull();
    expect(e.reload).not.toHaveBeenCalled();
  });

  it("offers a new version once it is installed, and only a tap switches to it and reloads this tab", async () => {
    const { e, container } = env(true);
    await registerServiceWorker(e);
    const w = new FakeWorker();
    container.registration.found(w);
    w.become("installed");
    const apply = waiting().current;
    expect(apply).not.toBeNull();
    expect(w.posted).toEqual([]);
    await apply!();
    expect(w.posted).toEqual([{ type: "SKIP_WAITING" }]);
    expect(e.reload).not.toHaveBeenCalled();
    container.takeOver();
    expect(e.reload).toHaveBeenCalledTimes(1);
  });

  // The tab that installed the first worker had no controller when it registered; a later update still works there.
  it("switches and reloads in the tab that installed the first worker", async () => {
    const { e, container } = env(false);
    await registerServiceWorker(e);
    const first = new FakeWorker();
    container.registration.found(first);
    first.become("installed");
    container.takeOver();
    const next = new FakeWorker();
    container.registration.found(next);
    next.become("installed");
    await waiting().current!();
    container.takeOver();
    expect(e.reload).toHaveBeenCalledTimes(1);
  });

  it("offers a version already waiting when the page opens", async () => {
    const { e, container } = env(true);
    container.registration.waiting = new FakeWorker();
    container.registration.waiting.state = "installed";
    await registerServiceWorker(e);
    expect(waiting().current).not.toBeNull();
  });

  // Another tab switched to the new version: this tab keeps its page and offers Reload, never reloading by itself.
  it("never reloads when another tab switched versions, and offers Reload instead", async () => {
    const { e, container } = env(true);
    await registerServiceWorker(e);
    container.takeOver();
    expect(e.reload).not.toHaveBeenCalled();
    const apply = waiting().current;
    expect(apply).not.toBeNull();
    await apply!();
    expect(e.reload).toHaveBeenCalledTimes(1);
  });

  it("checks for a new version when the tab is shown again, and every hour", async () => {
    const { e, container, doc, timers } = env(true);
    await registerServiceWorker(e);
    expect(container.registration.update).not.toHaveBeenCalled();
    (doc as unknown as { visibilityState: string }).visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(container.registration.update).not.toHaveBeenCalled();
    (doc as unknown as { visibilityState: string }).visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(container.registration.update).toHaveBeenCalledTimes(1);
    expect(timers).toHaveLength(1);
    timers[0]!();
    expect(container.registration.update).toHaveBeenCalledTimes(2);
  });
});
