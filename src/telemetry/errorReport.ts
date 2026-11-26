// Crash reports for the web app (Firebase Crashlytics for web). An uncaught error's message can hold what the user
// checked (a JSON parse error quotes the model's answer, which can quote the label; a Firestore error quotes a
// document path), and a stack repeats the message, so no text of the error leaves the page. A report carries the
// error's name from a fixed list, a Firebase code from a fixed list or an HTTP status, and the code locations of the
// stack: only the address, line and column of each place in a script this page loaded, with no function name, query
// or fragment. A line of the message can look like a stack frame, but it adds at most one more of this page's own
// script addresses, never its words. The SDK loads on the first error, so a visit with no error sends nothing and
// downloads none of it.

import type { FirebaseApp } from "firebase/app";
import type { Crashlytics, CrashlyticsOptions } from "firebase/crashlytics";

export type SafeErrorReport = { name: string; message: string; stack: string };

export type CrashlyticsApi = {
  getCrashlytics: (app: FirebaseApp, options: CrashlyticsOptions) => Crashlytics;
  recordError: (crashlytics: Crashlytics, error: unknown) => void;
};

export type ErrorReportDeps = {
  /** Where uncaught errors arrive: the page's window. */
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  /** Whether an address (with no query or fragment) is a script this page loaded: only those locations are kept. */
  isScript: (url: string) => boolean;
  /** The started Firebase app, if any. Reporting never starts Firebase itself. */
  app: () => FirebaseApp | undefined;
  load: () => Promise<CrashlyticsApi>;
  /** This build's id (the commit /version.json names), so a report lines up with the release it came from. */
  appVersion: string | undefined;
};

const MAX_REPORTS_PER_PAGE = 5;
const MAX_FRAMES = 40;

// The error names a report may carry: the language's and the browser's own error types, Firebase's, and this app's
// own classes. Any other name, which could be a word from what the user checked, is sent as "Error".
const NAMES = new Set([
  "Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "EvalError", "URIError", "AggregateError",
  "AbortError", "NotAllowedError", "NotFoundError", "NotReadableError", "NotSupportedError", "OverconstrainedError",
  "NetworkError", "QuotaExceededError", "SecurityError", "TimeoutError", "InvalidStateError", "DataError", "DataCloneError",
  "UnknownError", "OperationError", "DOMException", "FirebaseError", "AIError",
  "ReadFailure", "CameraError", "CropError", "NotBoxOwner", "EditionError", "FirebaseConfigError", "SampleMismatch",
  "InvalidReadError", "NoEditionError", "BadInputError",
]);
// The codes a report may carry, word for word: Firestore's own codes, and the Firebase Auth, App Check, AI Logic,
// Installations and Remote Config codes this app can meet. Any other code is left out.
const CODES = new Set([
  "cancelled", "unknown", "invalid-argument", "deadline-exceeded", "not-found", "already-exists", "permission-denied",
  "resource-exhausted", "failed-precondition", "aborted", "out-of-range", "unimplemented", "internal", "unavailable",
  "data-loss", "unauthenticated",
  "auth/network-request-failed", "auth/internal-error", "auth/too-many-requests", "auth/operation-not-allowed",
  "auth/admin-restricted-operation", "auth/user-token-expired", "auth/web-storage-unsupported",
  "appCheck/fetch-network-error", "appCheck/fetch-status-error", "appCheck/fetch-parse-error", "appCheck/throttled",
  "appCheck/recaptcha-error", "appCheck/initial-throttle",
  "AI/error", "AI/fetch-error", "AI/request-error", "AI/response-error", "AI/invalid-content", "AI/api-not-enabled",
  "AI/parse-failed", "AI/unsupported",
  "installations/app-offline", "installations/request-failed",
  "remoteconfig/fetch-throttle", "remoteconfig/fetch-timeout", "remoteconfig/fetch-status", "remoteconfig/fetch-client-network",
]);

// An address with a line and column, as V8, Firefox and Safari print it in a stack.
const LOCATION = /(https?:\/\/[^\s()@]+?|blob:https?:\/\/[^\s()@]+?)(?:[?#][^\s()]*?)?:(\d{1,7}):(\d{1,7})(?=[\s)]|$)/g;

/** The parts of an uncaught error that are safe to send. Null when there is nothing to report. */
export function safeErrorReport(reason: unknown, isScript: (url: string) => boolean): SafeErrorReport | null {
  if (reason === null || reason === undefined) return null;
  if (!(reason instanceof Error)) return { name: "Error", message: `non-error value thrown (${typeof reason})`, stack: "" };

  const name = NAMES.has(reason.name) ? reason.name : "Error";
  const parts = ["message removed"];
  const code = (reason as { code?: unknown }).code;
  if (typeof code === "string" && CODES.has(code)) parts.push(`code ${code}`);
  const status = (reason as { customErrorData?: { status?: unknown } }).customErrorData?.status;
  if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599) parts.push(`status ${status}`);
  const message = parts.join("; ");

  const frames: string[] = [];
  const text = typeof reason.stack === "string" ? reason.stack : "";
  for (const m of text.matchAll(LOCATION)) {
    if (frames.length === MAX_FRAMES) break;
    const url = m[1]!;
    if (isScript(url)) frames.push(`    at ${url}:${m[2]}:${m[3]}`);
  }
  return { name, message, stack: [`${name}: ${message}`, ...frames].join("\n") };
}

/** Listens for uncaught errors and rejections on the page; returns a function that stops listening. */
export function startErrorReports(deps: ErrorReportDeps): () => void {
  // Reports handed to the SDK, and reports waiting for it to load. A load that fails frees its reports' slots.
  const seen = new Set<string>();
  const pending = new Set<string>();
  let ready: Promise<{ api: CrashlyticsApi; crashlytics: Crashlytics }> | undefined;

  const report = (reason: unknown) => {
    try {
      const r = safeErrorReport(reason, deps.isScript);
      if (!r) return;
      const key = `${r.name}\n${r.message}\n${r.stack}`;
      if (seen.has(key) || pending.has(key) || seen.size + pending.size >= MAX_REPORTS_PER_PAGE) return;
      const app = deps.app();
      if (!app) return;
      pending.add(key);
      const options: CrashlyticsOptions = { captureUnhandledErrors: false };
      if (deps.appVersion) options.appVersion = deps.appVersion;
      ready ??= deps.load().then((api) => ({ api, crashlytics: api.getCrashlytics(app, options) }));
      const loading = ready;
      loading
        .then(({ api, crashlytics }) => {
          const e = new Error(r.message);
          e.name = r.name;
          e.stack = r.stack;
          api.recordError(crashlytics, e);
          pending.delete(key);
          seen.add(key);
        })
        .catch(() => {
          // A report must never break the page; a failed load is tried again on the next error, this one included.
          pending.delete(key);
          if (ready === loading) ready = undefined;
        });
    } catch {
      // dropped on purpose: reporting an error must not raise another one
    }
  };

  const onError = (event: Event) => report((event as ErrorEvent).error);
  const onRejection = (event: Event) => report((event as PromiseRejectionEvent).reason);
  deps.target.addEventListener("error", onError);
  deps.target.addEventListener("unhandledrejection", onRejection);
  return () => {
    deps.target.removeEventListener("error", onError);
    deps.target.removeEventListener("unhandledrejection", onRejection);
  };
}
