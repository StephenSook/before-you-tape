// The narrow interface the read pipeline uses to talk to a model, so it can be tested without the SDK.

export type InferenceSourceName = "on_device" | "in_cloud";

export interface ImagePart {
  mimeType: "image/jpeg";
  base64: string;
}

export interface ModelReply {
  text: string;
  source: InferenceSourceName;
  // The SDK named no route: the reply counts as cloud, and the card says the route was not reported.
  unreported?: true;
}

// What a call that can reach the cloud carries: the check that the cloud is still allowed, and a signal the
// page aborts when the sender or the pause withdraws it. The SDK checks the signal before it gets its
// tokens and again before the request, so a withdrawn call sends nothing.
export interface CallOptions {
  allowed?: () => boolean;
  signal?: AbortSignal;
}

export interface ModelPort {
  generate(prompt: string, image?: ImagePart, opts?: CallOptions): Promise<ModelReply>;
}

// device: ONLY_ON_DEVICE behind the device guard; hybrid: PREFER_ON_DEVICE; cloud: ONLY_IN_CLOUD;
// fallback: ONLY_IN_CLOUD on a second model, tried once when the cloud model answers 500 or 503.
export interface ItemModels {
  device: ModelPort;
  hybrid: ModelPort;
  cloud: ModelPort;
  fallback?: ModelPort;
}

// "checking": the page has not heard yet whether this browser has a built-in model.
export type GateState = "checking" | "available" | "downloadable" | "downloading" | "unavailable" | "no_api";

export type ReadRoute = "device_only" | "hybrid" | "cloud_only" | "blocked";
// How an image reached the read: the camera saw an item sit still, the sender pressed Check now, or added a photo.
export type ImageHow = "steady" | "check_now" | "upload";
