// Starts the on-device model download through Firebase AI Logic and reports progress from 0 to 1.
// Chrome only allows it after a user gesture, so the caller runs it from a button press.
import type { AI } from "firebase/ai";
import { deviceDownloadModel } from "./firebaseModels";

export async function prepareDeviceModel(ai: AI, onProgress: (fraction: number) => void): Promise<void> {
  await deviceDownloadModel(ai).initializeDeviceModel(onProgress);
}
