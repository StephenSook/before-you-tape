import { describe, expect, it } from "vitest";
import { CONFIG_DEFAULTS } from "./defaults";

describe("CONFIG_DEFAULTS", () => {
  it("holds the spec 5.10 defaults that Remote Config overrides", () =>
    expect(CONFIG_DEFAULTS).toEqual({
      cloudModelItem: "gemini-3.5-flash-lite", cloudModelItemFallback: "gemini-3.8-flash", cloudModelText: "gemini-3.5-flash-lite", killCloud: false,
      secondLook: { whMismatch: true, batteryNumbers: true, notSure: true, hazardNoLabel: true, identity: true },
      rulesEditionId: "", rulesEditionSha256: "",
    }));
});
