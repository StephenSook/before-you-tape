// The files that let a phone open a laptop's join link in the app, and how Hosting serves them.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { JOIN_ORIGINS, makeJoinLink } from "../../src/shared/joinLink";

const json = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
interface Header { key: string; value: string }
interface HostingRule { source: string; headers: Header[] }
const hosting = (json("firebase.json") as { hosting: { headers?: HostingRule[] } }).hosting;
const headersFor = (source: string): Record<string, string> =>
  Object.fromEntries((hosting.headers ?? []).filter((h) => h.source === source).flatMap((h) => h.headers.map((x) => [x.key, x.value])));
// The path every join link starts with, taken from the code that makes the links.
const JOIN_PATH = new URL(makeJoinLink(JOIN_ORIGINS[0], "box1", "A".repeat(26))).pathname.replace(/[^/]+$/, "");

describe("app links for join links", () => {
  it("makes join links under /join/ on the one canonical origin", () => {
    expect(JOIN_ORIGINS).toEqual(["https://before-you-tape-2026.web.app"]);
    expect(JOIN_PATH).toBe("/join/");
  });

  it("names the Android app and its release signing key", () => {
    expect(json("public/.well-known/assetlinks.json")).toEqual([{
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "app.beforeyoutape.android",
        sha256_cert_fingerprints: ["7D:67:2A:F6:DD:84:C0:91:4B:F0:C7:75:CD:55:52:A3:2E:D2:CC:F0:1C:CE:9A:AA:AB:79:EE:9B:3F:63:6A:DA"],
      },
    }]);
  });

  it("names the iPhone app and claims only the join path", () => {
    const aasa = json("public/.well-known/apple-app-site-association") as { applinks: { details: Array<{ appIDs: string[]; components: Array<Record<string, string>> }> } };
    expect(aasa.applinks.details).toHaveLength(1);
    expect(aasa.applinks.details[0]?.appIDs).toEqual(["Y8XVCMLQCZ.app.beforeyoutape.reader"]);
    expect(aasa.applinks.details[0]?.components.map((c) => c["/"])).toEqual([`${JOIN_PATH}*`]);
  });

  it("serves both files as JSON, and join pages with no referrer and no caching", () => {
    expect(headersFor("/.well-known/apple-app-site-association")).toEqual({ "Content-Type": "application/json" });
    expect(headersFor("/.well-known/assetlinks.json")).toEqual({ "Content-Type": "application/json" });
    expect(headersFor(`${JOIN_PATH}**`)).toEqual({ "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" });
  });
});
