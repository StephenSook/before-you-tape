import type { FirebaseApp } from "firebase/app";
import { describe, expect, it, vi } from "vitest";
import { safeErrorReport, startErrorReports, type CrashlyticsApi } from "./errorReport";

const ORIGIN = "https://byt.example";
// The scripts this page loaded, in these tests: the built chunks under /assets/.
const LOADED = new Set([`${ORIGIN}/assets/index-abc.js`, `${ORIGIN}/assets/PackPage-def.js`]);
const isScript = (url: string) => LOADED.has(url);
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
    const r = safeErrorReport(v8Error(`${ITEM}: ${LABEL}`, [`    at readItem (${ORIGIN}/assets/index-abc.js:1:2345)`]), isScript);
    expect(leaks(JSON.stringify(r))).toEqual([]);
    expect(r?.message).toBe("message removed");
    expect(r?.stack).toBe(`Error: message removed\n    at ${ORIGIN}/assets/index-abc.js:1:2345`);
  });

  it("drops the label a real JSON parse error quotes from the model's answer", () => {
    let parseError: unknown;
    try {
      JSON.parse(`${LABEL} ${ITEM}`);
    } catch (e) {
      parseError = e;
    }
    expect(String((parseError as Error).message)).toContain("Capacity");
    const r = safeErrorReport(parseError, isScript);
    expect(r?.name).toBe("SyntaxError");
    expect(leaks(JSON.stringify(r))).toEqual([]);
  });

  it("keeps only the location of each frame in a script this page loaded, never a function name", () => {
    const e = v8Error(LABEL, [
      `    at async Promise.all (index 0)`,
      `    at new BoxStore (${ORIGIN}/assets/index-abc.js:3:4)`,
      `    at Object.lotion [as go] (${ORIGIN}/assets/PackPage-def.js:5:6)`,
      `    at grecaptcha (https://www.gstatic.com/recaptcha/x.js:7:8)`,
      `    at strawberry (${ORIGIN}/assets/Strawberry-lotion.js:9:9)`,
      `    at x (blob:${ORIGIN}/0c5e-11aa:5:6)`,
    ]);
    expect(safeErrorReport(e, isScript)?.stack).toBe([`Error: message removed`, `    at ${ORIGIN}/assets/index-abc.js:3:4`, `    at ${ORIGIN}/assets/PackPage-def.js:5:6`].join("\n"));
  });

  it("sends no word of a message that was shortened after its stack was taken, at a line break or not", () => {
    const old = `${ITEM}\n    at lotion (${ORIGIN}/assets/index-abc.js:9:9)\n${LABEL}`;
    for (const shorter of [ITEM, "short", ""]) {
      const e = v8Error(old, [`    at readItem (${ORIGIN}/assets/index-abc.js:1:2)`]);
      e.message = shorter;
      const r = safeErrorReport(e, isScript);
      expect(leaks(JSON.stringify(r)), shorter).toEqual([]);
      // The old message's frame-shaped line gives at most one more of this page's own script addresses.
      expect(r?.stack.split("\n").slice(1).every((l) => /^ {4}at https:\/\/byt\.example\/assets\/index-abc\.js:\d+:\d+$/.test(l))).toBe(true);
    }
  });

  it("reads Firefox and Safari frames, and drops a query or fragment from a location", () => {
    const e = new Error(LABEL);
    e.stack = [`pack/<@${ORIGIN}/assets/index-abc.js?v=2:10:11`, `Strawberry lotion@${ORIGIN}/assets/PackPage-def.js#x:1:1`, `promiseReactionJob@[native code]`].join("\n");
    const r = safeErrorReport(e, isScript);
    expect(r?.stack).toBe([`Error: message removed`, `    at ${ORIGIN}/assets/index-abc.js:10:11`, `    at ${ORIGIN}/assets/PackPage-def.js:1:1`].join("\n"));
    expect(leaks(JSON.stringify(r))).toEqual([]);
  });

  it("drops a location on a page address, which is not a loaded script, with its query", () => {
    const r = safeErrorReport(v8Error("x", [`    at onImage (${ORIGIN}/pack${QUERY}:4:5)`]), isScript);
    expect(r?.stack).toBe("Error: message removed");
  });

  it("names only error types it knows, and keeps only Firebase codes from its list, word for word", () => {
    const named = (name: string) => safeErrorReport(Object.assign(new Error("x"), { name }), isScript)?.name;
    expect(["TypeError", "SyntaxError", "AbortError", "FirebaseError", "ReadFailure", "InvalidReadError"].map(named))
      .toEqual(["TypeError", "SyntaxError", "AbortError", "FirebaseError", "ReadFailure", "InvalidReadError"]);
    // A one-word item name or box id shaped like an identifier is not sent as a name.
    expect(["Lotion", "Strawberry", "PowerBank", "box_u1"].map(named)).toEqual(["Error", "Error", "Error", "Error"]);
    const coded = (code: string) => safeErrorReport(Object.assign(new Error("x"), { name: "FirebaseError", code }), isScript)?.message;
    expect(coded("permission-denied")).toBe("message removed; code permission-denied");
    expect(coded("appCheck/fetch-status-error")).toBe("message removed; code appCheck/fetch-status-error");
    expect(coded("AI/fetch-error")).toBe("message removed; code AI/fetch-error");
    for (const free of ["Strawberry", "lotion", "box-u1", "items/lotion", "storage/strawberry-lotion", "AI/strawberry", "auth/lotion"]) {
      expect(coded(free), free).toBe("message removed");
    }
  });

  it("keeps an HTTP status, a number from the SDK", () => {
    const ai = Object.assign(new Error(LABEL), { name: "FirebaseError", code: "AI/fetch-error", customErrorData: { status: 429 } });
    expect(safeErrorReport(ai, isScript)?.message).toBe("message removed; code AI/fetch-error; status 429");
  });

  it("reports a thrown non-error by its type only", () => {
    expect(safeErrorReport(LABEL, isScript)).toEqual({ name: "Error", message: "non-error value thrown (string)", stack: "" });
    expect(safeErrorReport({ box: BOX }, isScript)).toEqual({ name: "Error", message: "non-error value thrown (object)", stack: "" });
    expect(safeErrorReport(undefined, isScript)).toBeNull();
    expect(safeErrorReport(null, isScript)).toBeNull();
  });

  it("caps the frames it keeps", () => {
    const frames = Array.from({ length: 100 }, (_, i) => `    at f${i} (${ORIGIN}/assets/index-abc.js:${i}:1)`);
    expect(safeErrorReport(v8Error("x", frames), isScript)?.stack.split("\n")).toHaveLength(41);
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
    recordError: vi.fn((_c: unknown, e: unknown) => void recorded.push(e as Error)),
  };
  return { api, recorded, instance };
}

const settle = () => new Promise((r) => setTimeout(r, 0));
const APP = { name: "[DEFAULT]" } as FirebaseApp;

describe("startErrorReports", () => {
  it("sends no label text, item name, box contents or query string, whatever the error holds", async () => {
    const { target, raise, reject } = fakeTarget();
    const { api, recorded } = fakeCrashlytics();
    startErrorReports({ target, isScript, app: () => APP, load: async () => api, appVersion: "byt-build-abc" });
    raise(v8Error(`${ITEM}\n${LABEL}\n${BOX}`, [`    at readItem (${ORIGIN}/pack${QUERY}:1:2)`, `    at onImage (${ORIGIN}/assets/index-abc.js:3:4)`]));
    reject(Object.assign(new Error(`${BOX} ${LABEL}`), { name: "FirebaseError", code: "permission-denied" }));
    raise(Object.assign(new Error(`${ITEM}${QUERY}`), { name: "Strawberry", code: "storage/strawberry-lotion" }));
    await settle();
    expect(recorded).toHaveLength(3);
    for (const e of recorded) {
      expect(leaks(JSON.stringify([e.name, e.message, e.stack]))).toEqual([]);
      expect(e.message.startsWith("message removed")).toBe(true);
    }
    expect(recorded[0]?.stack).toBe(`Error: message removed\n    at ${ORIGIN}/assets/index-abc.js:3:4`);
  });

  it("loads nothing until an error happens, then sends it without its message", async () => {
    const { target, raise } = fakeTarget();
    const { api, recorded } = fakeCrashlytics();
    const load = vi.fn(async () => api);
    startErrorReports({ target, isScript, app: () => APP, load, appVersion: "byt-build-abc" });
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
    startErrorReports({ target, isScript, app: () => APP, load: async () => api, appVersion: undefined });
    reject(Object.assign(new Error(LABEL), { name: "FirebaseError", code: "unavailable" }));
    await settle();
    expect(api.getCrashlytics).toHaveBeenCalledWith(APP, { captureUnhandledErrors: false });
    expect(recorded.map((e) => [e.name, e.message])).toEqual([["FirebaseError", "message removed; code unavailable"]]);
  });

  it("sends one report per distinct error and at most five a page", async () => {
    const { target, raise } = fakeTarget();
    const { api, recorded } = fakeCrashlytics();
    startErrorReports({ target, isScript, app: () => APP, load: async () => api, appVersion: undefined });
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
    startErrorReports({ target, isScript, app: () => APP, load, appVersion: undefined });
    raise(null);
    await settle();
    expect(load).not.toHaveBeenCalled();
  });

  it("sends nothing before Firebase has started, and never starts Firebase itself", async () => {
    const { target, raise } = fakeTarget();
    const load = vi.fn(async () => fakeCrashlytics().api);
    startErrorReports({ target, isScript, app: () => undefined, load, appVersion: undefined });
    raise(new Error("x"));
    await settle();
    expect(load).not.toHaveBeenCalled();
  });

  it("never throws when the SDK cannot load, and tries again on the next error", async () => {
    const { target, raise } = fakeTarget();
    const { api, recorded } = fakeCrashlytics();
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(api);
    startErrorReports({ target, isScript, app: () => APP, load, appVersion: undefined });
    expect(() => raise(v8Error("x", [`    at f (${ORIGIN}/assets/index-abc.js:1:1)`]))).not.toThrow();
    await settle();
    raise(v8Error("y", [`    at g (${ORIGIN}/assets/index-abc.js:2:1)`]));
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
    expect(recorded).toHaveLength(1);
  });

  it("tries the same error again after the SDK failed to load, and a failed load uses no report slot", async () => {
    const { target, raise } = fakeTarget();
    const { api, recorded } = fakeCrashlytics();
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(api);
    startErrorReports({ target, isScript, app: () => APP, load, appVersion: undefined });
    const same = () => v8Error("x", [`    at f (${ORIGIN}/assets/index-abc.js:1:1)`]);
    raise(same());
    await settle();
    raise(same());
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
    expect(recorded).toHaveLength(1);
  });

  it("keeps all five report slots after five failed loads", async () => {
    const { target, raise } = fakeTarget();
    const { api, recorded } = fakeCrashlytics();
    const load = vi.fn();
    for (let i = 0; i < 5; i++) load.mockRejectedValueOnce(new Error("offline"));
    load.mockResolvedValue(api);
    startErrorReports({ target, isScript, app: () => APP, load, appVersion: undefined });
    const at = (i: number) => v8Error("x", [`    at f (${ORIGIN}/assets/index-abc.js:${i}:1)`]);
    for (let i = 1; i <= 5; i++) { raise(at(i)); await settle(); }
    for (let i = 6; i <= 10; i++) raise(at(i));
    await settle();
    expect(recorded.map((e) => e.stack?.split(":").at(-2))).toEqual(["6", "7", "8", "9", "10"]);
  });

  it("stops listening when stopped", async () => {
    const { target, raise } = fakeTarget();
    const load = vi.fn(async () => fakeCrashlytics().api);
    const stop = startErrorReports({ target, isScript, app: () => APP, load, appVersion: undefined });
    stop();
    raise(new Error("x"));
    await settle();
    expect(load).not.toHaveBeenCalled();
  });
});
