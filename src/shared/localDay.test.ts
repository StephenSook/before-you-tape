import { describe, expect, it } from "vitest";
import { localDay } from "./localDay";

describe("localDay", () => {
  it("gives the device's own calendar date as YYYY-MM-DD, from its local parts", () => {
    expect(localDay(new Date(2026, 10, 29, 0, 5))).toBe("2026-11-29");
    expect(localDay(new Date(2026, 0, 3, 23, 59))).toBe("2026-01-03");
    expect(localDay(new Date(999, 11, 31, 12))).toBe("0999-12-31");
  });
});
