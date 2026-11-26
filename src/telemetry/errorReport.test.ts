import type { FirebaseApp } from "firebase/app";
import { describe, expect, it, vi } from "vitest";
import { safeErrorReport, startErrorReports, type CrashlyticsApi } from "./errorReport";

const ORIGIN = "https://byt.example";
// What a user checks, which must never reach a report: label text, an item's name, the box, a page address's query.
const LABEL = "Capacity:50000mAh 3.7V 185Wh";
const ITEM = "Strawberry dream body lotion";
const BOX = "1 power bank, 2 lotions for Philippines";
const QUERY = "?item=strawberry-lotion&country=PH";
const PLANTED = ["Capacity", "50000mAh", "185Wh", "Strawberry", "strawberry", "lotion", "Philippines", "country=PH", "item="];

// A V8 stack: the message (here user text) heads the stack, then the frames.
function v8Error(message: string, frames: string[]): Error {
  const e = new Error(message);
  e.stack = [`Error: ${message}`, ...frames].join("\n");
  return e;
}

const leaks = (text: string) => PLANTED.filter((s) => text.includes(s));

describe("safeErrorReport", () => {
  it("never carries the error's message, even when the message is label text", () => {
    const r = safeErrorReport(v8Error(`${ITEM}: ${LABEL}`, [`    at readItem (${ORIGIN}/assets/index-abc.js:1:2345)`]), ORIGIN);
    expect(leaks(JSON.stringify(r))).toEqual([]);
    expect(r?.message).toBe("message removed");
    expect(r?.stack).toBe(`Error: message removed\n    at readItem (${ORIGIN}/assets/index-abc.js:1:2345)`);
  });

  it("drops the label a real JSON parse error quotes from the model's answer", () => {
    let parseError: unknown;
    try {
      JSON.parse(`${LABEL} ${ITEM}`);
    } catch (e) {
      parseError = e;
    }
    expect(String((parseError as Error).message)).toContain("Capacity");
    const r = safeErrorReport(parseError, ORIGIN);
    expect(r?.name).toBe("SyntaxError");
    expect(leaks(JSON.stringify(r))).toEqual([]);
  });

  it("keeps only frames on this site, so a message line shaped like a frame is still dropped", () => {
    const e = v8Error(`${LABEL}\n    at lotion (https://elsewhere.example/x.js:1:2)`, [
      `    at async Promise.all (index 0)`,
      `    at new BoxStore (${ORIGIN}/assets/index-abc.js:3:4)`,
      `    at Object.run [as go] (blob:${ORIGIN}/0c5e-11aa:5:6)`,
      `    at grecaptcha (https://www.gstatic.com/recaptcha/x.js:7:8)`,
    ]);
    expect(safeErrorReport(e, ORIGIN)?.stack).toBe(
      [`Error: message removed`, `    at new BoxStore (${ORIGIN}/assets/index-abc.js:3:4)`, `    at Object.run [as go] (blob:${ORIGIN}/0c5e-11aa:5:6)`].join("\n"),
    );
  });

  it("drops a message line shaped like a frame on this site, in either browser's shape", () => {
    const fake = [`    at lotion (${ORIGIN}/assets/index-abc.js:9:9)`, `Strawberry lotion@${ORIGIN}/assets/index-abc.js:8:8`];
    const real = `    at readItem (${ORIGIN}/assets/index-abc.js:1:2)`;
    for (const line of fake) {
      const r = safeErrorReport(v8Error(`${LABEL}\n${line}`, [real]), ORIGIN);
      expect(r?.stack).toBe(`Error: message removed\n${real}`);
      // The same when the message was changed after the stack was taken (its first line no longer matches).
      const e = v8Error(`${LABEL}\n${line}`, [real]);
      e.message = `${e.message} (more)`;
      expect(safeErrorReport(e, ORIGIN)?.stack).toBe(`Error: message removed\n${real}`);
    }
  });

  it("reads Firefox and Safari frames, and strips a query or fragment from a frame's address", () => {
    const e = new Error(LABEL);
    e.stack = [`pack/<@${ORIGIN}/assets/index-abc.js?v=2:10:11`, `global code@${ORIGIN}/pack${QUERY}#box:1:1`, `promiseReactionJob@[native code]`].join("\n");
    const r = safeErrorReport(e, ORIGIN);
    expect(r?.stack).toBe([`pack/<@${ORIGIN}/assets/index-abc.js:10:11`, `global code@${ORIGIN}/pack:1:1`].join("\n"));
    expect(leaks(JSON.stringify(r))).toEqual([]);
  });

  it("strips a query from a V8 frame's address too", () => {
    const r = safeErrorReport(v8Error("x", [`    at onImage (${ORIGIN}/pack${QUERY}:4:5)`]), ORIGIN);
    expect(r?.stack).toBe(`Error: message removed\n    at onImage (${ORIGIN}/pack:4:5)`);
  });

  it("keeps a Firebase error code and an HTTP status, which are fixed words from the SDK", () => {
    const fs = Object.assign(new Error(`No document to update: boxes/x/items/${ITEM}`), { name: "FirebaseError", code: "firestore/not-found" });
    expect(safeErrorReport(fs, ORIGIN)).toMatchObject({ name: "FirebaseError", message: "message removed; code firestore/not-found" });
    const ai = Object.assign(new Error(LABEL), { name: "FirebaseError", code: "AI/fetch-error", customErrorData: { status: 429 } });
    expect(safeErrorReport(ai, ORIGIN)?.message).toBe("message removed; code AI/fetch-error; status 429");
  });

  it("drops a code or a name that is not a plain identifier", () => {
    const e = Object.assign(new Error("x"), { name: "Strawberry lotion", code: `${ITEM} ${LABEL}` });
    expect(safeErrorReport(e, ORIGIN)).toMatchObject({ name: "Error", message: "message removed" });
  });

  it("reports a thrown non-error by its type only", () => {
    expect(safeErrorReport(LABEL, ORIGIN)).toEqual({ name: "Error", message: "non-error value thrown (string)", stack: "" });
    expect(safeErrorReport({ box: BOX }, ORIGIN)).toEqual({ name: "Error", message: "non-error value thrown (object)", stack: "" });
    expect(safeErrorReport(undefined, ORIGIN)).toBeNull();
    expect(safeErrorReport(null, ORIGIN)).toBeNull();
  });

  it("caps the frames it keeps", () => {
    const frames = Array.from({ length: 100 }, (_, i) => `    at f${i} (${ORIGIN}/assets/index-abc.js:${i}:1)`);
    expect(safeErrorReport(v8Error("x", frames), ORIGIN)?.stack.split("\n")).toHaveLength(41);
  });
});

function fakeTarget() {
  const target = new EventTarget();
  const raise = (error: unknown) => target.dispatchEvent(Object.assign(new Event("error"), { error }));
  const reject = (reason: unknown) => target.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason }));
  return { target, raise, reject };
}

function fakeCrashlytics() {
  const recorded: Error[] = [];
  const instance = { app: {} as FirebaseApp };
  const api: CrashlyticsApi = {
    getCrashlytics: vi.fn(() => instance),
    recordError: vi.fn((_c, e: unknown) => void recorded.push(e as Error)),
  };
  return { api, recorded, instance };
}

const settle = () => new Promise((r) => setTimeout(r, 0));
const APP = { name: "[DEFAULT]" } as FirebaseApp;

describe("startErrorReports", () => {
  it("sends no label text, item name, box contents or query string, whatever the error holds", async () => {
    const { target, raise, reject } = fakeTarget();
    const { api, recorded } = fakeCrashlytics();
    startErrorReports({ target, origin: ORIGIN, app: () => APP, load: async () => api, appVersion: "byt-build-abc" });
    raise(v8Error(`${ITEM}\n${LABEL}\n${BOX}`, [`    at readItem (${ORIGIN}/pack${QUERY}:1:2)`, `    at onImage (${ORIGIN}/assets/index-abc.js:3:4)`]));
    reject(Object.assign(new Error(`${BOX} ${LABEL}`), { name: "FirebaseError", code: "firestore/permission-denied" }));
    raise(new Error(`${ITEM}${QUERY}`));
    await settle();
    expect(recorded).toHaveLength(3);
    for (const e of recorded) {
      expect(leaks(JSON.stringify([e.name, e.message, e.stack]))).toEqual([]);
      expect(e.message.startsWith("message removed")).toBe(true);
    }
    expect(recorded[0]?.stack).toBe(`Error: message removed\n    at readItem (${ORIGIN}/pack:1:2)\n    at onImage (${ORIGIN}/assets/index-abc.js:3:4)`);
  });

  it("loads nothing until an error happens, then sends it without its message", async () => {
    const { target, raise } = fakeTarget();
    const { api, recorded } = fakeCrashlytics();
    const load = vi.fn(async () => api);
    startErrorReports({ target, origin: ORIGIN, app: () => APP, load, appVersion: "byt-build-abc" });
    await settle();
    expect(load).not.toHaveBeenCalled();

    raise(v8Error(LABEL, [`    at readItem (${ORIGIN}/assets/index-abc.js:1:2)`]));
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
    expect(api.getCrashlytics).toHaveBeenCalledWith(APP, { appVersion: "byt-build-abc", captureUnhandledErrors: false });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toBeInstanceOf(Error);
    expect(recorded[0]?.message).toBe("message removed");
  });

  it("reports an unhandled rejection the same way", async () => {
    const { target, reject } = fakeTarget();
    const { api, recorded } = fakeCrashlytics();
    startErrorReports({ target, origin: ORIGIN, app: () => APP, load: async () => api, appVersion: undefined });
    reject(Object.assign(new Error(LABEL), { name: "FirebaseError", code: "storage/unauthorized" }));
    await settle();
    expect(api.getCrashlytics).toHaveBeenCalledWith(APP, { captureUnhandledErrors: false });
    expect(recorded.map((e) => [e.name, e.message])).toEqual([["FirebaseError", "message removed; code storage/unauthorized"]]);
  });

  it("sends one report per distinct error and at most five a page", async () => {
    const { target, raise } = fakeTarget();
    const { api, recorded } = fakeCrashlytics();
    startErrorReports({ target, origin: ORIGIN, app: () => APP, load: async () => api, appVersion: undefined });
    const at = (i: number) => v8Error("x", [`    at f (${ORIGIN}/assets/index-abc.js:${i}:1)`]);
    raise(at(1));
    raise(at(1));
    for (let i = 2; i <= 9; i++) raise(at(i));
    await settle();
    expect(recorded.map((e) => e.stack?.split(":").at(-2))).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("skips an error event with no error object (a cross-origin script error)", async () => {
    const { target, raise } = fakeTarget();
    const load = vi.fn(async () => fakeCrashlytics().api);
    startErrorReports({ target, origin: ORIGIN, app: () => APP, load, appVersion: undefined });
    raise(null);
    await settle();
    expect(load).not.toHaveBeenCalled();
  });

  it("sends nothing before Firebase has started, and never starts Firebase itself", async () => {
    const { target, raise } = fakeTarget();
    const load = vi.fn(async () => fakeCrashlytics().api);
    startErrorReports({ target, origin: ORIGIN, app: () => undefined, load, appVersion: undefined });
    raise(new Error("x"));
    await settle();
    expect(load).not.toHaveBeenCalled();
  });

  it("never throws when the SDK cannot load, and tries again on the next error", async () => {
    const { target, raise } = fakeTarget();
    const { api, recorded } = fakeCrashlytics();
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(api);
    startErrorReports({ target, origin: ORIGIN, app: () => APP, load, appVersion: undefined });
    expect(() => raise(v8Error("x", [`    at f (${ORIGIN}/a.js:1:1)`]))).not.toThrow();
    await settle();
    raise(v8Error("y", [`    at g (${ORIGIN}/a.js:2:1)`]));
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
    expect(recorded).toHaveLength(1);
  });

  it("stops listening when stopped", async () => {
    const { target, raise } = fakeTarget();
    const load = vi.fn(async () => fakeCrashlytics().api);
    const stop = startErrorReports({ target, origin: ORIGIN, app: () => APP, load, appVersion: undefined });
    stop();
    raise(new Error("x"));
    await settle();
    expect(load).not.toHaveBeenCalled();
  });
});
