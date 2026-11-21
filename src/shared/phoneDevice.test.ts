import { describe, expect, it } from "vitest";
import { isPhoneDevice } from "./phoneDevice";

describe("isPhoneDevice", () => {
  it("trusts the browser's own mobile flag when it gives one", () => {
    expect(isPhoneDevice({ userAgentData: { mobile: true }, userAgent: "Macintosh" })).toBe(true);
    expect(isPhoneDevice({ userAgentData: { mobile: false }, userAgent: "Android Mobile" })).toBe(false);
  });

  it("reads the user agent when there is no mobile flag (Safari and Firefox)", () => {
    expect(isPhoneDevice({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148" })).toBe(true);
    expect(isPhoneDevice({ userAgent: "Mozilla/5.0 (Linux; Android 16; SM-A166U) Mobile Safari/537.36" })).toBe(true);
    expect(isPhoneDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15" })).toBe(false);
    expect(isPhoneDevice({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/157.0" })).toBe(false);
  });
});
