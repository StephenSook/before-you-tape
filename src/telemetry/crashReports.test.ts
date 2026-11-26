import { deleteApp, initializeApp } from "firebase/app";
import { describe, expect, it } from "vitest";
import { crashReportDeps } from "./crashReports";

describe("crashReportDeps", () => {
  it("names this site's origin and the default Firebase app only once it has started", async () => {
    const deps = crashReportDeps(new EventTarget(), "https://byt.example", "byt-build-abc");
    expect(deps.origin).toBe("https://byt.example");
    expect(deps.appVersion).toBe("byt-build-abc");
    expect(deps.app()).toBeUndefined();
    const app = initializeApp({ apiKey: "k", appId: "1:1:web:1", projectId: "p" });
    try {
      expect(deps.app()).toBe(app);
    } finally {
      await deleteApp(app);
    }
  });

  it("loads the Crashlytics SDK's two calls on demand", async () => {
    const api = await crashReportDeps(new EventTarget(), "https://byt.example", undefined).load();
    expect(typeof api.getCrashlytics).toBe("function");
    expect(typeof api.recordError).toBe("function");
  });
});
