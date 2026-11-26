// The page's crash reports: errorReport.ts wired to this window, the scripts this page loaded, the default Firebase
// app and the Crashlytics SDK, which is loaded (and its code downloaded) only when the first uncaught error happens.
// Only a production build reports, under its build id.

import { getApps } from "firebase/app";
import { startErrorReports, type ErrorReportDeps } from "./errorReport";

const bare = (url: string) => url.split(/[?#]/)[0]!;

/** Whether an address is a script this page loaded from its own origin: the document's scripts and the scripts in
 * the page's resource timing (which lists each chunk loaded later, such as a page's own code). */
export function loadedScript(origin: string, doc: Pick<Document, "scripts">, perf: Pick<Performance, "getEntriesByType">): (url: string) => boolean {
  return (url) => {
    if (!url.startsWith(`${origin}/`) || !/\.m?js$/.test(bare(url))) return false;
    const names = new Set<string>();
    for (const s of Array.from(doc.scripts)) if (s.src) names.add(bare(s.src));
    for (const e of perf.getEntriesByType("resource")) names.add(bare(e.name));
    return names.has(bare(url));
  };
}

export function crashReportDeps(target: ErrorReportDeps["target"], isScript: ErrorReportDeps["isScript"], appVersion: string | undefined): ErrorReportDeps {
  return {
    target,
    isScript,
    app: () => getApps().find((a) => a.name === "[DEFAULT]"),
    load: async () => {
      const { getCrashlytics, recordError } = await import("./crashlyticsSdk");
      return { getCrashlytics, recordError };
    },
    appVersion,
  };
}

export function startCrashReports(): () => void {
  return startErrorReports(crashReportDeps(window, loadedScript(location.origin, document, performance), __BYT_BUILD_ID__));
}
