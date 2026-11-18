import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/ai", async (orig) => {
  const real = await orig<typeof import("firebase/ai")>();
  return { ...real, getGenerativeModel: vi.fn(real.getGenerativeModel) };
});

import { getAI, getGenerativeModel, GoogleAIBackend, Schema, type AI, type HybridParams } from "firebase/ai";
import { initializeApp } from "firebase/app";
import { itemReadJsonSchema } from "../shared/itemRead";
import { itemReadCloudSchema } from "./cloudSchema";
import { createItemModels, createTextCloudModel } from "./firebaseModels";
import { DEVICE_CREATE_OPTIONS } from "./gate";
import type { ImagePart } from "./port";
import { ITEM_READ_SYSTEM } from "./prompts";

let n = 0;
const fakeAi = (): AI => getAI(initializeApp({ apiKey: "test-key", projectId: "demo-byt", appId: "1:1:web:1" }, `models-${n++}`), { backend: new GoogleAIBackend() });
const fakeLm = { availability: vi.fn(async () => "available") };
const img: ImagePart = { mimeType: "image/jpeg", base64: "AAAA" };
const spy = vi.mocked(getGenerativeModel);
const params = (i: number) => spy.mock.calls[i]?.[1] as HybridParams;

// A stand-in for a GenerativeModel: records what it was asked and answers like the SDK.
function fakeModel(reply: { text: string; inferenceSource?: "on_device" | "in_cloud" }) {
  const generateContent = vi.fn(async () => ({ response: { text: () => reply.text, inferenceSource: reply.inferenceSource } }));
  return { generateContent } as unknown as ReturnType<typeof getGenerativeModel> & { generateContent: typeof generateContent };
}

describe("createItemModels", () => {
  // Block bodies: Vitest runs a function returned from beforeEach as a teardown, and mockClear returns the mock.
  beforeEach(() => { spy.mockClear(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("builds three models with three modes and both schemas", () => {
    createItemModels(fakeAi(), "gemini-3.5-flash-lite", fakeLm);
    expect(spy.mock.calls.map((c) => (c[1] as HybridParams).mode)).toEqual(["only_on_device", "prefer_on_device", "only_in_cloud"]);
    const h = params(1);
    expect(h.inCloudParams?.model).toBe("gemini-3.5-flash-lite");
    expect(h.onDeviceParams?.promptOptions?.responseConstraint).toEqual(itemReadJsonSchema());
    expect(h.onDeviceParams?.createOptions?.initialPrompts?.[0]?.role).toBe("system");
    expect(JSON.parse(JSON.stringify(params(2).inCloudParams?.generationConfig?.responseSchema))).toEqual(JSON.parse(JSON.stringify(itemReadCloudSchema())));
    expect(params(2).inCloudParams?.systemInstruction).toBe(ITEM_READ_SYSTEM);
  });

  it("passes the same options to the session and to the availability check", () => {
    createItemModels(fakeAi(), "gemini-3.5-flash-lite", fakeLm);
    expect(params(0).onDeviceParams?.createOptions).toBe(DEVICE_CREATE_OPTIONS);
    expect(params(1).onDeviceParams?.createOptions).toBe(DEVICE_CREATE_OPTIONS);
  });

  it("builds no SDK device model when LanguageModel is missing", async () => {
    const m = createItemModels(fakeAi(), "gemini-3.5-flash-lite", undefined);
    expect(spy.mock.calls.map((c) => (c[1] as HybridParams).mode)).toEqual(["only_in_cloud"]);
    await expect(m.device.generate("p", img)).rejects.toMatchObject({ kind: "device_failed" });
    await expect(m.hybrid.generate("p", img)).rejects.toMatchObject({ kind: "device_failed" });
  });

  it("sends the prompt with a JPEG part and returns the text and where it ran", async () => {
    const hybrid = fakeModel({ text: "{}", inferenceSource: "on_device" });
    spy.mockReturnValueOnce(fakeModel({ text: "" })).mockReturnValueOnce(hybrid).mockReturnValueOnce(fakeModel({ text: "" }));
    const m = createItemModels(fakeAi(), "gemini-3.5-flash-lite", fakeLm);
    await expect(m.hybrid.generate("read it", img)).resolves.toEqual({ text: "{}", source: "on_device" });
    expect(hybrid.generateContent).toHaveBeenCalledWith(["read it", { type: "inlineData", inlineData: { mimeType: "image/jpeg", data: "AAAA" } }]);
  });

  it("never reports on_device unless the SDK says so, and marks a reply that names no route", async () => {
    spy.mockReturnValueOnce(fakeModel({ text: "" })).mockReturnValueOnce(fakeModel({ text: "{}" })).mockReturnValueOnce(fakeModel({ text: "{}", inferenceSource: "in_cloud" }));
    const m = createItemModels(fakeAi(), "gemini-3.5-flash-lite", fakeLm);
    await expect(m.hybrid.generate("p", img)).resolves.toEqual({ text: "{}", source: "in_cloud", unreported: true });
    await expect(m.cloud.generate("p", img)).resolves.toEqual({ text: "{}", source: "in_cloud" });
  });

  it("checks the on-device model again at call time and makes no SDK call when it is gone", async () => {
    const device = fakeModel({ text: "{}", inferenceSource: "on_device" });
    spy.mockReturnValueOnce(device).mockReturnValueOnce(fakeModel({ text: "" })).mockReturnValueOnce(fakeModel({ text: "" }));
    const m = createItemModels(fakeAi(), "gemini-3.5-flash-lite", fakeLm);
    vi.stubGlobal("LanguageModel", undefined);
    await expect(m.device.generate("p", img)).rejects.toMatchObject({ kind: "device_failed" });
    expect(device.generateContent).not.toHaveBeenCalled();
    vi.stubGlobal("LanguageModel", { availability: async () => "available" });
    await expect(m.device.generate("p", img)).resolves.toMatchObject({ source: "on_device" });
  });
});

describe("createTextCloudModel", () => {
  // Block bodies: Vitest runs a function returned from beforeEach as a teardown, and mockClear returns the mock.
  beforeEach(() => { spy.mockClear(); });

  it("calls only the cloud with the given schema and no image", async () => {
    const model = fakeModel({ text: "{\"lines\":[]}", inferenceSource: "in_cloud" });
    spy.mockReturnValueOnce(model);
    const schema = Schema.object({ properties: { lines: Schema.array({ items: Schema.string() }) } });
    const port = createTextCloudModel(fakeAi(), "gemini-3.5-flash-lite", schema);
    expect(params(0).mode).toBe("only_in_cloud");
    expect(params(0).inCloudParams?.generationConfig?.responseSchema).toBe(schema);
    await expect(port.generate("describe")).resolves.toEqual({ text: "{\"lines\":[]}", source: "in_cloud" });
    expect(model.generateContent).toHaveBeenCalledWith(["describe"]);
  });
});
