// Firebase AI Logic bindings: the only file that calls getGenerativeModel (the model guard enforces it).
// Three item-read models (spec 5.3): ONLY_ON_DEVICE behind the device guard, PREFER_ON_DEVICE, and
// ONLY_IN_CLOUD; plus a text-only cloud model for descriptions and listing reads.
import { getGenerativeModel, InferenceMode, type AI, type GenerativeModel, type ModelParams, type Part, type Schema } from "firebase/ai";
import { itemReadJsonSchema } from "../shared/itemRead";
import { itemReadCloudSchema } from "./cloudSchema";
import { checkGate, DEVICE_CREATE_OPTIONS, hasLanguageModelApi } from "./gate";
import { guardDevicePort, ReadFailure } from "./itemRead";
import type { ItemModels, ModelPort } from "./port";
import { ITEM_READ_SYSTEM } from "./prompts";

// Sends the prompt, plus the photo when there is one, and reports where the SDK says it ran. A reply
// without an inference source is counted as cloud, so nothing is ever claimed on-device by default.
function portFor(model: GenerativeModel, withImage: boolean): ModelPort {
  return {
    async generate(prompt, image) {
      const parts: Array<string | Part> = withImage && image
        ? [prompt, { type: "inlineData", inlineData: { mimeType: image.mimeType, data: image.base64 } }]
        : [prompt];
      const { response } = await model.generateContent(parts);
      return { text: response.text(), source: response.inferenceSource === "on_device" ? "on_device" : "in_cloud" };
    },
  };
}

const NO_DEVICE: ModelPort = {
  async generate() {
    throw new ReadFailure("device_failed", "this browser has no on-device model API");
  },
};

const ON_DEVICE_PARAMS = () => ({ createOptions: DEVICE_CREATE_OPTIONS, promptOptions: { responseConstraint: itemReadJsonSchema() } });

export function createItemModels(ai: AI, cloudModel: string, lm: unknown): ItemModels {
  const inCloudParams: ModelParams = {
    model: cloudModel,
    systemInstruction: ITEM_READ_SYSTEM,
    generationConfig: { responseMimeType: "application/json", responseSchema: itemReadCloudSchema() },
  };
  // Without the browser API, the device and hybrid ports refuse without touching the SDK.
  if (!hasLanguageModelApi(lm)) {
    const cloud = getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams });
    return { device: NO_DEVICE, hybrid: NO_DEVICE, cloud: portFor(cloud, true) };
  }
  const device = getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams: ON_DEVICE_PARAMS() });
  const hybrid = getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE, onDeviceParams: ON_DEVICE_PARAMS(), inCloudParams });
  const cloud = getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams });
  const deviceNow = () => checkGate((globalThis as { LanguageModel?: unknown }).LanguageModel);
  return { device: guardDevicePort(portFor(device, true), deviceNow), hybrid: portFor(hybrid, true), cloud: portFor(cloud, true) };
}

export function createTextCloudModel(ai: AI, cloudModel: string, schema: Schema): ModelPort {
  const model = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: { model: cloudModel, generationConfig: { responseMimeType: "application/json", responseSchema: schema } },
  });
  return portFor(model, false);
}

// The model handle prepareDeviceModel uses to start the on-device download.
export function deviceDownloadModel(ai: AI): GenerativeModel {
  return getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams: ON_DEVICE_PARAMS() });
}
