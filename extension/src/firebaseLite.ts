import { getAI, GoogleAIBackend, type AI } from "firebase/ai";
import { initializeApp } from "firebase/app";

const panel = "on-device-only";

export function initPanelFirebase(): { ai: AI } {
  // The SDK requires populated fields even for a local model. This value represents no Firebase project.
  const app = initializeApp({ apiKey: panel, projectId: panel, appId: panel }, panel);
  return { ai: getAI(app, { backend: new GoogleAIBackend() }) };
}
