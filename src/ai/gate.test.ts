import { describe, expect, it, vi } from "vitest";
import { checkGate, DEVICE_CREATE_OPTIONS } from "./gate";
import { ITEM_READ_SYSTEM } from "./prompts";

describe("checkGate", () => {
  it("maps availability and a missing API", async () => {
    expect(await checkGate(undefined)).toBe("no_api");
    expect(await checkGate({})).toBe("no_api");
    expect(await checkGate({ availability: async () => "downloadable" })).toBe("downloadable");
    expect(await checkGate({ availability: async () => "available" })).toBe("available");
    expect(await checkGate({ availability: async () => { throw new Error("x"); } })).toBe("unavailable");
    expect(await checkGate({ availability: async () => "something-new" })).toBe("unavailable");
  });

  it("asks availability with the session's own options", async () => {
    const availability = vi.fn(async () => "available");
    await checkGate({ availability });
    expect(availability).toHaveBeenCalledWith(DEVICE_CREATE_OPTIONS);
  });

  it("asks availability with the supplied text-only options", async () => {
    const options = { ...DEVICE_CREATE_OPTIONS, expectedInputs: DEVICE_CREATE_OPTIONS.expectedInputs?.slice(0, 1) };
    const availability = vi.fn(async () => "available");
    await checkGate({ availability }, options);
    expect(availability).toHaveBeenCalledWith(options);
  });

  it("sets the on-device input and output languages", () => {
    expect(DEVICE_CREATE_OPTIONS.expectedInputs).toEqual([{ type: "text", languages: ["en"] }, { type: "image" }]);
    expect(DEVICE_CREATE_OPTIONS.expectedOutputs).toEqual([{ type: "text", languages: ["en"] }]);
  });

  it("starts the on-device session with the item read system text", () =>
    expect(DEVICE_CREATE_OPTIONS.initialPrompts).toEqual([{ role: "system", content: [{ type: "text", value: ITEM_READ_SYSTEM }] }]));
});
