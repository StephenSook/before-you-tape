import { deleteApp, initializeApp } from "firebase/app";
import { describe, expect, it } from "vitest";
import { crashReportDeps, loadedScript } from "./crashReports";

describe("crashReportDeps", () => {
  it("names the default Firebase app only once it has started", async () => {
    const deps = crashReportDeps(new EventTarget(), () => false, "byt-build-abc");
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
    const api = await crashReportDeps(new EventTarget(), () => false, undefined).load();
    expect(typeof api.getCrashlytics).toBe("function");
    expect(typeof api.recordError).toBe("function");
  });
});

describe("loadedScript", () => {
  const O = "https://byt.example";
  const doc = { scripts: [{ src: `${O}/assets/index-abc.js` }, { src: "" }] } as unknown as Pick<Document, "scripts">;
  const perf = { getEntriesByType: () => [{ name: `${O}/assets/PackPage-def.js?v=1` }, { name: `${O}/eval/items/own-01.jpg` }, { name: "https://www.gstatic.com/x.js" }] } as unknown as Pick<Performance, "getEntriesByType">;
  const is = loadedScript(O, doc, perf);

  it("knows the document's scripts and the scripts the page loaded later, on its own origin, query or not", () => {
    expect([`${O}/assets/index-abc.js`, `${O}/assets/PackPage-def.js`, `${O}/assets/index-abc.js?x=1`].map(is)).toEqual([true, true, true]);
  });

  it("refuses any other address: another script name, a photo, a page, another origin", () => {
    expect([`${O}/assets/Strawberry-lotion.js`, `${O}/eval/items/own-01.jpg`, `${O}/pack`, "https://www.gstatic.com/x.js", `blob:${O}/0c5e`].map(is))
      .toEqual([false, false, false, false, false]);
  });
});
