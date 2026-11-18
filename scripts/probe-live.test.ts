import { describe, expect, it } from "vitest";
import { appCheckRefusal, isPlainText, modelStatus, PROBE_RETIRES_AFTER, probeRetired } from "./probe-live";

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
