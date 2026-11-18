import { describe, expect, it, vi } from "vitest";

const initializeDeviceModel = vi.fn(async (onProgress?: (p: number) => void) => { onProgress?.(0.5); onProgress?.(1); });
vi.mock("./firebaseModels", () => ({ deviceDownloadModel: vi.fn(() => ({ initializeDeviceModel })) }));

import type { AI } from "firebase/ai";
import { prepareDeviceModel } from "./deviceModel";
import { deviceDownloadModel } from "./firebaseModels";

describe("prepareDeviceModel", () => {
  it("downloads the on-device model through the SDK and reports progress", async () => {
    const seen: number[] = [];
    const ai = {} as AI;
    await prepareDeviceModel(ai, (f) => seen.push(f));
    expect(deviceDownloadModel).toHaveBeenCalledWith(ai);
    expect(initializeDeviceModel).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([0.5, 1]);
  });
});
