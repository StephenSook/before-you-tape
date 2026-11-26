// The web app's public privacy page names every kind of thing the saved box list holds, as forStorage in
// src/data/boxStore.ts sends it to Firestore.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("the web privacy page names the label figures the saved box list holds", () => {
  const page = readFileSync("public/privacy/index.html", "utf8");
  expect(page).toContain("its battery numbers, the Wh and lithium-grams figures its label names (numbers only)");
});

// What the page says about error reports is what src/telemetry sends: the message always replaced, only a code and
// a status added to it, frames on this site with no query, at most five a page, no SDK capture of its own, and the
// SDK loaded only on an error.
it("the web privacy page's error report entry matches the code that sends the reports", () => {
  const page = readFileSync("public/privacy/index.html", "utf8").replace(/\s+/g, " ");
  expect(page).toContain("The error's message is removed in your browser before anything is sent, and so is anything after a question mark in a page address");
  expect(page).toContain("A visit with no such error sends no report, and one page sends at most five.");
  expect(page).toContain("Reports are kept in our project's Cloud Logging for 30 days.");
  const report = readFileSync("src/telemetry/errorReport.ts", "utf8");
  expect(report).toContain('const parts = ["message removed"];');
  expect(report).toContain("const MAX_REPORTS_PER_PAGE = 5;");
  expect(report).toContain("captureUnhandledErrors: false");
  expect(report).not.toMatch(/customAttributes|breadcrumbs|setUserId|log\(/);
  const wiring = readFileSync("src/telemetry/crashReports.ts", "utf8");
  expect(wiring).toContain('await import("firebase/crashlytics")');
  expect(readFileSync("src/main.tsx", "utf8")).toContain("if (import.meta.env.PROD) startCrashReports();");
});
