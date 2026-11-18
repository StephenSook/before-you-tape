// In-app defaults for the Remote Config keys (spec 5.10). Remote Config overrides them once it loads;
// until then, and offline, these are the values the app runs with.
export const CONFIG_DEFAULTS = {
  // cloud_model_item: the cloud model for item reads.
  cloudModelItem: "gemini-3.5-flash-lite",
  // cloud_model_item_fallback: tried once when the item model still answers 500 or 503 after its retry;
  // an empty value turns it off.
  cloudModelItemFallback: "gemini-3.8-flash",
  // cloud_model_text: the cloud model for descriptions and listing reads.
  cloudModelText: "gemini-3.5-flash-lite",
  // kill_cloud: pause every cloud call; checks on the device still work.
  killCloud: false,
};
