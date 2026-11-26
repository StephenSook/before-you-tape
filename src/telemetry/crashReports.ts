// The page's crash reports: errorReport.ts wired to this window, the default Firebase app and the Crashlytics SDK,
// which is loaded (and its code downloaded) only when the first uncaught error happens. Only a production build
// reports, under its build id.

import { getApps } from "firebase/app";
import { startErrorReports, type ErrorReportDeps } from "./errorReport";

export function crashReportDeps(target: ErrorReportDeps["target"], origin: string, appVersion: string | undefined): ErrorReportDeps {
  return {
    target,
    origin,
    app: () => getApps().find((a) => a.name === "[DEFAULT]"),
    load: async () => {
      const { getCrashlytics, recordError } = await import("./crashlyticsSdk");
      return { getCrashlytics, recordError };
    },
    appVersion,
  };
}

export function startCrashReports(): () => void {
  return startErrorReports(crashReportDeps(window, location.origin, __BYT_BUILD_ID__));
}
