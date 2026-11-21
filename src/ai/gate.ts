// Whether the browser's on-device model can take an item read right now. The only place that asks
// LanguageModel.availability (the model guard enforces it), with the same options the session uses.
import type { LanguageModelCreateOptions } from "firebase/ai";
import type { GateState } from "./port";
import { ITEM_READ_SYSTEM } from "./prompts";

export const DEVICE_CREATE_OPTIONS: LanguageModelCreateOptions = {
  expectedInputs: [{ type: "text", languages: ["en"] }, { type: "image" }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
  initialPrompts: [{ role: "system", content: [{ type: "text", value: ITEM_READ_SYSTEM }] }],
};

const STATES: ReadonlySet<string> = new Set<GateState>(["available", "downloadable", "downloading", "unavailable"]);

export function hasLanguageModelApi(lm: unknown): boolean {
  return typeof (lm as { availability?: unknown } | null | undefined)?.availability === "function";
}

export async function checkGate(lm: unknown, options: LanguageModelCreateOptions = DEVICE_CREATE_OPTIONS): Promise<GateState> {
  if (!hasLanguageModelApi(lm)) return "no_api";
  const api = lm as { availability(options: LanguageModelCreateOptions): Promise<unknown> };
  try {
    const state = await api.availability(options);
    return typeof state === "string" && STATES.has(state) ? (state as GateState) : "unavailable";
  } catch {
    return "unavailable";
  }
}
