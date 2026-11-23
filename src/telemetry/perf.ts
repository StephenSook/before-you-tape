// The trace sink for the web app: Firebase Performance Monitoring custom traces. The SDK loads on the first trace,
// so a page that never reads an item never fetches it. Its automatic page-load and network-request traces are off:
// it sends the AI call traces (src/telemetry/aiTrace.ts) and nothing else of its own.
import type { FirebaseApp } from "firebase/app";
import type { FirebasePerformance } from "firebase/performance";
import { aiTracer, NO_AI_TRACE, type AiTracer, type TraceSink } from "./aiTrace";

export type PerfModule = Pick<typeof import("firebase/performance"), "initializePerformance" | "trace">;

export function perfSink(app: FirebaseApp, load: () => Promise<PerfModule> = () => import("firebase/performance")): TraceSink {
  let ready: Promise<{ m: PerfModule; perf: FirebasePerformance }> | null = null;
  return {
    record(name, startMs, durationMs, options) {
      ready ??= load().then((m) => ({ m, perf: m.initializePerformance(app, { instrumentationEnabled: false }) }));
      // A trace that cannot be sent (the chunk failed to load, a browser without the APIs it needs) is dropped:
      // telemetry never breaks the read it describes.
      void ready.then(({ m, perf }) => m.trace(perf, name).record(startMs, durationMs, options)).catch(() => undefined);
    },
  };
}

// The pages that read items. Performance Monitoring sends the page's address (without its query) with each trace,
// so a trace that ends anywhere else is dropped: /blind/<token> holds a secret session token in its path.
const READ_PAGES = new Set(["/", "/judge"]);

const currentPage = () => globalThis.location?.pathname ?? "";
// "/judge/" opens the same page as "/judge".
const isReadPage = (path: string) => READ_PAGES.has(path.replace(/\/+$/, "") || "/");

// The app's tracer. An emulator build has no real project to send to, and an automated browser (navigator.webdriver:
// the Playwright runs and the deploy gate's live checks) is a test, so neither sends traces and test reads never mix
// into the numbers of real reads.
export function appAiTracer(
  app: FirebaseApp, where: { emulators: boolean; automated: boolean }, sink: () => TraceSink = () => perfSink(app), page: () => string = currentPage,
): AiTracer {
  if (where.emulators || where.automated) return NO_AI_TRACE;
  const inner = sink();
  return aiTracer({ record: (...args) => { if (isReadPage(page())) inner.record(...args); } });
}
