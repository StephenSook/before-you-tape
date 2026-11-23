// The trace sink for the web app: Firebase Performance Monitoring custom traces. The SDK loads on the first trace,
// so a page that never reads an item never fetches it. Its automatic page-load and network-request traces are off:
// it sends the AI call traces (src/telemetry/aiTrace.ts) and nothing else of its own.
import type { FirebaseApp } from "firebase/app";
import type { FirebasePerformance } from "firebase/performance";
import type { TraceSink } from "./aiTrace";

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
