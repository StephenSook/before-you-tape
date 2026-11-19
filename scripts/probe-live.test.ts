import { describe, expect, it } from "vitest";
import { appCheckRefusal, appLinkFile, callableRefusal, isPlainText, modelStatus, PROBE_RETIRES_AFTER, probeRetired } from "./probe-live";

const page = [
  "| **Model** | **Gemini Developer API** | **Agent Platform Gemini API** |",
  "|---|---|---|",
  "| `gemini-3.8-flash` <br /> Release date: September 2, 2026 Release stage: Stable | Shutdown date: --- | Shutdown date: --- |",
  "| `gemini-3.7-flash` ^2^ <br /> Release date: August 13, 2026 Release stage: Stable | Requests routed to `gemini-3.8-flash` Replacement: `gemini-3.8-flash` | Shutdown date: January 28, 2027 |",
  "| `gemini-3.6-flash` ^2^ <br /> Release date: July 21, 2026 Release stage: Stable | Shutdown date: December 3, 2026 Replacement: `gemini-3.8-flash` | Shutdown date: --- |",
  "| `gemini-3.5-flash-lite` <br /> Release date: July 21, 2026 Release stage: Stable | Shutdown date: January 9, 2027 | Shutdown date: --- |",
  "| `gemini-2.5-flash-lite` <br /> Release date: July 22, 2025 Release stage: Stable | Shutdown date: --- Replacement: `gemini-3.5-flash-lite` | Shutdown date: October 20, 2026 |",
].join("\n");

describe("modelStatus", () => {
  it("passes a model with no Gemini Developer API shutdown date, or one after the judging window", () => {
    expect(modelStatus(page, "gemini-3.8-flash")).toEqual({ ok: true, detail: "Shutdown date: ---" });
    expect(modelStatus(page, "gemini-3.5-flash-lite")).toMatchObject({ ok: true });
  });

  it("fails a model that is routed elsewhere, shuts down before the window ends, has a replacement, or is missing", () => {
    expect(modelStatus(page, "gemini-3.7-flash")).toMatchObject({ ok: false, detail: expect.stringMatching(/Requests routed/) });
    expect(modelStatus(page, "gemini-3.6-flash")).toMatchObject({ ok: false, detail: expect.stringMatching(/December 3, 2026/) });
    expect(modelStatus(page, "gemini-2.5-flash-lite")).toMatchObject({ ok: false, detail: expect.stringMatching(/Replacement/) });
    expect(modelStatus(page, "gemini-9-none")).toEqual({ ok: false, detail: "not listed on the models page" });
  });

  it("does not match one model's row for another whose id it starts with", () =>
    expect(modelStatus("| `gemini-3.5-flash-lite` <br /> x | Shutdown date: --- | --- |", "gemini-3.5-flash")).toMatchObject({ ok: false }));
});

describe("isPlainText", () => {
  it("accepts text/plain with or without a charset, and nothing else", () => {
    expect(isPlainText("text/plain")).toBe(true);
    expect(isPlainText("text/plain; charset=utf-8")).toBe(true);
    expect(isPlainText("text/html; charset=utf-8")).toBe(false);
    expect(isPlainText(null)).toBe(false);
  });
});

describe("probeRetired", () => {
  it("retires after the last judging day", () => {
    expect(PROBE_RETIRES_AFTER).toBe("2026-12-17");
    expect(probeRetired("2026-12-17")).toBe(false);
    expect(probeRetired("2026-12-18")).toBe(true);
  });
});

describe("appCheckRefusal", () => {
  const refusal = { error: { code: 401, status: "UNAUTHENTICATED", message: "Firebase App Check token is invalid." } };

  it("passes only the App Check refusal: 401 with that exact message", () => {
    expect(appCheckRefusal(401, refusal)).toEqual({ ok: true, detail: "HTTP 401: Firebase App Check token is invalid." });
  });

  it("fails an answer, a key problem, or any other refusal", () => {
    expect(appCheckRefusal(200, { candidates: [] })).toMatchObject({ ok: false, detail: expect.stringMatching(/HTTP 200/) });
    expect(appCheckRefusal(400, { error: { message: "API key not valid. Please pass a valid API key." } })).toMatchObject({ ok: false });
    expect(appCheckRefusal(403, { error: { message: "Requests from referer <empty> are blocked." } })).toMatchObject({ ok: false });
    expect(appCheckRefusal(401, { error: { message: "Request had invalid authentication credentials." } })).toMatchObject({ ok: false });
    expect(appCheckRefusal(401, null)).toMatchObject({ ok: false });
  });
});

describe("appLinkFile", () => {
  const file = [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app" } }];
  const served = (over: Partial<{ status: number; redirected: boolean; contentType: string | null; body: string }> = {}) =>
    ({ status: 200, redirected: false, contentType: "application/json", body: JSON.stringify(file, null, 2), ...over });

  it("passes the repository's file served as JSON from the exact host", () => {
    expect(appLinkFile(served(), file).ok).toBe(true);
    expect(appLinkFile(served({ contentType: "application/json; charset=utf-8" }), file).ok).toBe(true);
  });

  it("fails a redirect, a missing file, the wrong type, other bytes, or a page that is not JSON", () => {
    expect(appLinkFile(served({ status: 301 }), file).ok).toBe(false);
    expect(appLinkFile(served({ redirected: true }), file).ok).toBe(false);
    expect(appLinkFile(served({ status: 404 }), file).ok).toBe(false);
    expect(appLinkFile(served({ contentType: "application/octet-stream" }), file).ok).toBe(false);
    expect(appLinkFile(served({ body: "[]" }), file).ok).toBe(false);
    expect(appLinkFile(served({ body: "<!doctype html>" }), file)).toMatchObject({ ok: false, detail: expect.stringContaining("not the repository's file") });
  });
});

describe("callableRefusal", () => {
  it("passes only the callable's own refusal of a call with no App Check token", () => {
    expect(callableRefusal(401, { error: { message: "Unauthenticated", status: "UNAUTHENTICATED" } }).ok).toBe(true);
    expect(callableRefusal(200, { result: { boxId: "b" } }).ok).toBe(false);
    expect(callableRefusal(404, null).ok).toBe(false);
    expect(callableRefusal(401, { error: { status: "PERMISSION_DENIED" } }).ok).toBe(false);
  });
});
