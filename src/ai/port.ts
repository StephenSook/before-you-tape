// The narrow interface the read pipeline uses to talk to a model, so it can be tested without the SDK.

export type InferenceSourceName = "on_device" | "in_cloud";

export interface ImagePart {
  mimeType: "image/jpeg";
  base64: string;
}

export interface ModelReply {
  text: string;
  source: InferenceSourceName;
}

export interface ModelPort {
  generate(prompt: string, image?: ImagePart): Promise<ModelReply>;
}

// device: ONLY_ON_DEVICE behind the device guard; hybrid: PREFER_ON_DEVICE; cloud: ONLY_IN_CLOUD.
export interface ItemModels {
  device: ModelPort;
  hybrid: ModelPort;
  cloud: ModelPort;
}

export type GateState = "available" | "downloadable" | "downloading" | "unavailable" | "no_api";

export type ReadRoute = "device_only" | "hybrid" | "cloud_only" | "blocked";
