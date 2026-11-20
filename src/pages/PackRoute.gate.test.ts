import { describe, expect, it } from "vitest";
import { INITIAL_GATE } from "./PackRoute";

describe("PackRoute", () => {
  it("starts with the device model unknown, so a press waits for checkGate instead of reading it as no model", () => {
    expect(INITIAL_GATE).toBe("checking");
  });
});
