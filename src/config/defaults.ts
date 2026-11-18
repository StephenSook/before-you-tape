// In-app defaults for the Remote Config keys (spec 5.10). Remote Config overrides them once it loads
// (plan Task 22); until then, and offline, these are the values the app runs with.
export const CONFIG_DEFAULTS = {
  // cloud_model_item: the cloud model for item reads.
  cloudModelItem: "gemini-3.5-flash-lite",
  // cloud_model_text: the cloud model for descriptions and listing reads.
  cloudModelText: "gemini-3.5-flash-lite",
  // kill_cloud: pause every cloud call; checks on the device still work.
  killCloud: false,
};
