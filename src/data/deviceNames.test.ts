import { beforeEach, describe, expect, it } from "vitest";
import { deviceNames } from "./deviceNames";

describe("deviceNames", () => {
  beforeEach(() => localStorage.clear());

  it("keeps each box's names in this browser and gives them back", () => {
    const d = deviceNames(localStorage);
    d.remember("b1", { i1: { read: "Shea body lotion", override: "My lotion" }, i2: { read: "Scarf" } });
    expect(d.recall("b1")).toEqual({ i1: { read: "Shea body lotion", override: "My lotion" }, i2: { read: "Scarf" } });
    expect(d.recall("b2")).toEqual({});
  });

  it("ignores a damaged record and any value that is not a name", () => {
    localStorage.setItem("byt.names.b1", "{not json");
    expect(deviceNames(localStorage).recall("b1")).toEqual({});
    localStorage.setItem("byt.names.b1", JSON.stringify({ i1: { read: "Lotion" }, i2: 3, i3: { read: 4 }, i4: { read: "Hat", override: 5 } }));
    expect(deviceNames(localStorage).recall("b1")).toEqual({ i1: { read: "Lotion" }, i4: { read: "Hat" } });
  });
});
