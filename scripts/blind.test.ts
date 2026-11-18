import { describe, expect, it } from "vitest";
import { assertOutsideRepo, blindLink, callsFromRest, newToken, sessionFields } from "./blind";

describe("blind session admin", () => {
  it("mints 32-character URL-safe tokens that do not repeat", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newToken()));
    expect(tokens.size).toBe(200);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("links to the blind page on the live site", () =>
    expect(blindLink("abc")).toBe("https://before-you-tape-2026.web.app/blind/abc"));

  it("writes a new session unlocked, for one set", () =>
    expect(sessionFields("set-1", new Date("2026-11-19T12:00:00Z"))).toEqual({
      setId: { stringValue: "set-1" }, createdAt: { timestampValue: "2026-11-19T12:00:00.000Z" }, lockedAt: { nullValue: null },
    }));

  it("refuses to export inside the repo", () => {
    expect(() => assertOutsideRepo("/repo/eval/x.json", "/repo")).toThrow();
    expect(() => assertOutsideRepo("/repo", "/repo")).toThrow();
    expect(() => assertOutsideRepo("/repo/../repo/x.json", "/repo")).toThrow();
    expect(() => assertOutsideRepo("/private/x.json", "/repo")).not.toThrow();
    expect(() => assertOutsideRepo("/repository/x.json", "/repo")).not.toThrow();
  });

  it("reads calls from the Firestore REST answer and skips anything malformed", () =>
    expect(callsFromRest({ documents: [
      { fields: { itemId: { stringValue: "a" }, destination: { stringValue: "CA" }, call: { stringValue: "ship" }, at: { timestampValue: "2026-11-19T12:01:00Z" } } },
      { fields: { itemId: { stringValue: "b" }, destination: { stringValue: "PH" }, call: { stringValue: "depends" } } },
      { fields: { itemId: { stringValue: "c" } } },
    ] })).toEqual([
      { itemId: "a", destination: "CA", call: "ship", at: "2026-11-19T12:01:00Z" },
      { itemId: "b", destination: "PH", call: "depends", at: null },
    ]));
});
