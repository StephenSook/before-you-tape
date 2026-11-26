// Crash reports for the web app (Firebase Crashlytics for web). An uncaught error's message can hold what the user
// checked (a JSON parse error quotes the model's answer, which can quote the label; a Firestore error quotes a
// document path), so no message leaves the page: a report carries the error's name, a Firebase code or HTTP status
// when there is one, and the stack frames on this site, with any query or fragment removed. The SDK loads on the
// first error, so a visit with no error sends nothing and downloads none of it.

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
  /** The page's own origin: only stack frames on it are kept. */
  origin: string;
  /** The started Firebase app, if any. Reporting never starts Firebase itself. */
  app: () => FirebaseApp | undefined;
  load: () => Promise<CrashlyticsApi>;
  /** This build's id (the commit /version.json names), so a report lines up with the release it came from. */
  appVersion: string | undefined;
};

const MAX_REPORTS_PER_PAGE = 5;
const MAX_FRAMES = 40;
const MAX_FRAME_LENGTH = 500;
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
// The codes a report may carry: Firestore's own codes, and a Firebase service's "service/code-words".
const FIRESTORE_CODES = new Set([
  "cancelled", "unknown", "invalid-argument", "deadline-exceeded", "not-found", "already-exists", "permission-denied",
  "resource-exhausted", "failed-precondition", "aborted", "out-of-range", "unimplemented", "internal", "unavailable",
  "data-loss", "unauthenticated",
]);
const SERVICE_CODE = /^(?:firestore|auth|appCheck|app-check|AI|installations|remoteconfig|remote-config|performance|app|storage|functions|messaging|analytics|crashlytics)\/[a-z0-9]+(?:-[a-z0-9]+){0,8}$/;
const safeCode = (code: unknown) => typeof code === "string" && (FIRESTORE_CODES.has(code) || SERVICE_CODE.test(code));

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The parts of an uncaught error that are safe to send. Null when there is nothing to report. */
export function safeErrorReport(reason: unknown, origin: string): SafeErrorReport | null {
  if (reason === null || reason === undefined) return null;
  if (!(reason instanceof Error)) return { name: "Error", message: `non-error value thrown (${typeof reason})`, stack: "" };

  const name = NAMES.has(reason.name) ? reason.name : "Error";
  const parts = ["message removed"];
  const code = (reason as { code?: unknown }).code;
  if (safeCode(code)) parts.push(`code ${code as string}`);
  const status = (reason as { customErrorData?: { status?: unknown } }).customErrorData?.status;
  if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599) parts.push(`status ${status}`);
  const message = parts.join("; ");

  // A frame is kept only when its function name looks like code and its address is on this site.
  const site = `(?:${escape(origin)}|blob:${escape(origin)})/[\\w\\-./%~]*`;
  const loc = `(${site})(?:[?#][^\\s()]*?)?(:\\d+:\\d+)`;
  const v8 = new RegExp(`^ {4}at (?:(?:new |async )?[\\w$.<>\\[\\]]{1,200}(?: \\[as [\\w$.]{1,64}\\])? \\()?${loc}\\)?$`);
  const gecko = new RegExp(`^(?:(?:global|module|eval) code|[\\w$.<>/\\[\\]*]{0,200})@${loc}$`);
  const text = typeof reason.stack === "string" ? reason.stack : "";
  const v8Style = /^ {4}at /m.test(text);
  // A V8 stack starts with the message, which can be several lines of label text: cut it before reading frames.
  const lines = v8Style ? withoutV8Header(text, reason) : text.split("\n");
  const re = v8Style ? v8 : gecko;
  const frames: string[] = [];
  for (const line of lines) {
    if (frames.length === MAX_FRAMES) break;
    // Drop any query or fragment from the frame's address (a page address can carry what the user typed).
    if (re.test(line)) frames.push(line.replace(re, (m, url: string, pos: string) => m.replace(/(?:https?:|blob:)[^\s()]*:\d+:\d+/, `${url}${pos}`)).slice(0, MAX_FRAME_LENGTH));
  }
  const stack = v8Style ? [`${name}: ${message}`, ...frames].join("\n") : frames.join("\n");
  return { name, message, stack };
}

/** The lines of a V8 stack after its "Name: message" header. */
function withoutV8Header(stack: string, e: Error): string[] {
  const m = String(e.message);
  const names = new Set([e.name, "Error", e.constructor?.name].filter((n): n is string => typeof n === "string" && n !== ""));
  for (const n of names) {
    const header = m ? `${n}: ${m}` : n;
    if (stack === header) return [];
    if (stack.startsWith(`${header}\n`)) return stack.slice(header.length + 1).split("\n");
  }
  // The message changed after the stack was taken, so where the old one ends is unknown: keep no frame, since a line
  // of the old message could look like one.
  return [];
}

/** Listens for uncaught errors and rejections on the page; returns a function that stops listening. */
export function startErrorReports(deps: ErrorReportDeps): () => void {
  // Reports handed to the SDK, and reports waiting for it to load. A load that fails frees its reports' slots.
  const seen = new Set<string>();
  const pending = new Set<string>();
  let ready: Promise<{ api: CrashlyticsApi; crashlytics: Crashlytics }> | undefined;

  const report = (reason: unknown) => {
    try {
      const r = safeErrorReport(reason, deps.origin);
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
