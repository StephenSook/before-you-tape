// Firebase AI Logic bindings: the only file that calls getGenerativeModel (the model guard enforces it).
// Three item-read models (spec 5.3): ONLY_ON_DEVICE behind the device guard, PREFER_ON_DEVICE, and
// ONLY_IN_CLOUD, plus an optional cloud-only fallback model, and the extension's product reads, laptop or cloud.
import { getGenerativeModel, InferenceMode, type AI, type GenerativeModel, type LanguageModelCreateOptions, type ModelParams, type Part, type Schema } from "firebase/ai";
import { itemReadJsonSchema } from "../shared/itemRead";
import { itemReadCloudSchema } from "./cloudSchema";
import { checkGate, DEVICE_CREATE_OPTIONS, hasLanguageModelApi } from "./gate";
import { guardDevicePort, ReadFailure } from "./itemRead";
import type { ItemModels, ModelPort } from "./port";
import { PRODUCT_TEXT_SYSTEM } from "./productText";
import { ITEM_READ_SYSTEM } from "./prompts";
import { NO_AI_TRACE, type AiCall, type AiTracer } from "../telemetry/aiTrace";

// Ports built without a tracer (the extension's product reads) send no trace, so their call details are never read.
const UNTRACED: AiCall = { mode: "only_in_cloud", cloudModel: "" };

// Sends the prompt, plus the photo when there is one, and reports where the SDK says it ran. A reply
// without an inference source is counted as cloud, so nothing is ever claimed on-device by default,
// and is marked unreported so the card does not claim the cloud either. Each SDK call is one
// Performance Monitoring trace (src/telemetry/aiTrace.ts) with the route the SDK reported.
function portFor(model: GenerativeModel, withImage: boolean, tracer: AiTracer = NO_AI_TRACE, call: AiCall = UNTRACED): ModelPort {
  return {
    async generate(prompt, image, opts) {
      const parts: Array<string | Part> = withImage && image
        ? [prompt, { type: "inlineData", inlineData: { mimeType: image.mimeType, data: image.base64 } }]
        : [prompt];
      const trace = tracer.start(call);
      let where: unknown;
      let text: string;
      try {
        // The SDK checks the signal before it gets its tokens and again before the request (its hybrid
        // mode's own cloud step included), so a withdrawn read sends nothing.
        const { response } = opts?.signal ? await model.generateContent(parts, { signal: opts.signal }) : await model.generateContent(parts);
        where = response.inferenceSource;
        text = response.text();
      } catch (e) {
        trace.failed(e, opts?.signal?.aborted === true, where);
        throw e;
      }
      trace.ok(where);
      if (where === "on_device") return { text, source: "on_device" };
      if (where === "in_cloud") return { text, source: "in_cloud" };
      return { text, source: "in_cloud", unreported: true };
    },
  };
}

const NO_DEVICE: ModelPort = {
  async generate() {
    throw new ReadFailure("device_failed", "this browser has no on-device model API");
  },
};

const ON_DEVICE_PARAMS = () => ({ createOptions: DEVICE_CREATE_OPTIONS, promptOptions: { responseConstraint: itemReadJsonSchema() } });

// The on-device-only models send any request they make to a host that cannot resolve (RFC 2606). Measured in a test:
// with the Prompt API saying its model was available, the SDK's ONLY_ON_DEVICE mode sent the read to the cloud
// (docs/evidence/on-device-only-request-2026-11-19.md). The device guard is the first check; this makes sure such a
// request reaches no server.
export const ON_DEVICE_ONLY_REQUESTS = { baseUrl: "https://on-device-only.invalid" } as const;

const itemCloudParams = (model: string): ModelParams => ({
  model,
  systemInstruction: ITEM_READ_SYSTEM,
  generationConfig: { responseMimeType: "application/json", responseSchema: itemReadCloudSchema() },
});

// The fallback is a cloud-only model of its own; none when it is empty or the same as the main model.
function fallbackPort(ai: AI, cloudModel: string, fallbackModel: string, tracer: AiTracer): ModelPort | undefined {
  if (!fallbackModel || fallbackModel === cloudModel) return undefined;
  const model = getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams: itemCloudParams(fallbackModel) });
  return portFor(model, true, tracer, { mode: "only_in_cloud", cloudModel: fallbackModel });
}

// tracer: where each SDK call's trace goes; the app passes Performance Monitoring, tools and tests nothing.
export function createItemModels(ai: AI, cloudModel: string, lm: unknown, fallbackModel = "", tracer: AiTracer = NO_AI_TRACE): ItemModels {
  const inCloudParams = itemCloudParams(cloudModel);
  const withFallback = (m: ItemModels): ItemModels => {
    const fallback = fallbackPort(ai, cloudModel, fallbackModel, tracer);
    return fallback ? { ...m, fallback } : m;
  };
  const cloudCall: AiCall = { mode: "only_in_cloud", cloudModel };
  // Without the browser API, the device and hybrid ports refuse without touching the SDK.
  if (!hasLanguageModelApi(lm)) {
    const cloud = getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams });
    return withFallback({ device: NO_DEVICE, hybrid: NO_DEVICE, cloud: portFor(cloud, true, tracer, cloudCall) });
  }
  const device = getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams: ON_DEVICE_PARAMS() }, ON_DEVICE_ONLY_REQUESTS);
  const hybrid = getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE, onDeviceParams: ON_DEVICE_PARAMS(), inCloudParams });
  const cloud = getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams });
  const deviceNow = () => checkGate((globalThis as { LanguageModel?: unknown }).LanguageModel);
  return withFallback({
    device: guardDevicePort(portFor(device, true, tracer, { mode: "only_on_device", cloudModel: "" }), deviceNow),
    hybrid: portFor(hybrid, true, tracer, { mode: "prefer_on_device", cloudModel }),
    cloud: portFor(cloud, true, tracer, cloudCall),
  });
}

export const PRODUCT_CREATE_OPTIONS: LanguageModelCreateOptions = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
  initialPrompts: [{ role: "system", content: [{ type: "text", value: PRODUCT_TEXT_SYSTEM }] }],
};

export function createProductDevicePort(ai: AI, lm: unknown): ModelPort {
  if (!hasLanguageModelApi(lm)) return NO_DEVICE;
  const model = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: { createOptions: PRODUCT_CREATE_OPTIONS, promptOptions: { responseConstraint: itemReadJsonSchema() } },
  }, ON_DEVICE_ONLY_REQUESTS);
  return guardDevicePort(portFor(model, false), () =>
    checkGate((globalThis as { LanguageModel?: unknown }).LanguageModel, PRODUCT_CREATE_OPTIONS));
}

function createTextCloudModel(ai: AI, cloudModel: string, schema: Schema, systemInstruction?: string): ModelPort {
  const model = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: { model: cloudModel, systemInstruction, generationConfig: { responseMimeType: "application/json", responseSchema: schema } },
  });
  return portFor(model, false);
}

// The model handle prepareDeviceModel uses to start the on-device download.
export function deviceDownloadModel(ai: AI): GenerativeModel {
  return getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams: ON_DEVICE_PARAMS() }, ON_DEVICE_ONLY_REQUESTS);
}

export function createProductCloudPort(ai: AI, cloudModel: string): ModelPort {
  return createTextCloudModel(ai, cloudModel, itemReadCloudSchema(), PRODUCT_TEXT_SYSTEM);
}
