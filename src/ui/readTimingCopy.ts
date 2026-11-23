// What every model read sends besides the read itself, said the same way wherever the app explains it. It matches
// the Performance Monitoring trace (src/telemetry/aiTrace.ts): the route, the model, the outcome and the latency.
export const READ_TIMING_SENT =
  "Each model read, on this device or in the cloud, sends Firebase Performance Monitoring a timing record: where it ran, the model, whether it worked and how long it took, never the photo or the label text.";
