import { describe, expect, it } from "vitest";
import { controlPassed, exchangeRequest, redact } from "./appcheck-control";

describe("appcheck-control", () => {
  it("passes only when the call without a token is refused with 401 and the call with one succeeds", () => {
    expect(controlPassed(401, 200)).toBe(true);
    expect(controlPassed(200, 200)).toBe(false);
    expect(controlPassed(403, 200)).toBe(false);
    expect(controlPassed(401, 401)).toBe(false);
    expect(controlPassed(401, null)).toBe(false);
  });

  it("removes every secret from text it writes", () => {
    expect(redact("key AIzaTEST and token tok-123 in tok-123", ["AIzaTEST", "tok-123", ""])).toBe("key <REDACTED> and token <REDACTED> in <REDACTED>");
  });

  it("asks for a limited-use token, which AI Logic requires now that replay protection is enforced", () =>
    expect(exchangeRequest("debug-1")).toEqual({ debug_token: "debug-1", limited_use: true }));
});
