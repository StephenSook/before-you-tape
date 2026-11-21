// Browser side of scripts/device-e2e.ts, served by the Vite dev server only. It runs the real read
// pipeline on the device_only route, so a pass means the app's own code read the photo on the device.
import { createItemModels } from "../../src/ai/firebaseModels";
import { checkGate } from "../../src/ai/gate";
import { readItem, ReadFailure } from "../../src/ai/itemRead";
import { initFirebase, type FirebaseEnv } from "../../src/firebase/app";
import { cropToJpeg, decodePhoto } from "../../src/capture/crop";
import { parseEdition } from "../../src/engine/edition";
import { evalRows, type EvalPath, type RunnerFailure } from "../../src/eval/runner";
import type { EvalRow, EvalSet } from "../../src/eval/types";
import { CROP_LIMITS } from "../../src/shared/cropLimits";
import type { ImagePart } from "../../src/ai/port";

interface Photo { file: string; base64: string }
interface HarnessRead {
  file: string;
  source: string | null;
  ms: number | null;
  recoveredFrom: string | null;
  error: string | null;
  itemName?: string;
  category?: string;
  evidence?: string;
}

interface EvalRunInput {
  items: { itemId: string; base64: string }[];
  set: EvalSet;
  edition: unknown;
  date: string;
  repeat: number;
  paths: EvalPath[];
  cloudModel: string;
  fallbackModel: string;
}

declare global {
  interface Window {
    bytDeviceE2E: (photos: Photo[]) => Promise<{ gate: string; reads: HarnessRead[] }>;
    bytEvalRun: (input: EvalRunInput) => Promise<{ gate: string; rows: EvalRow[]; failures: RunnerFailure[] }>;
  }
}

window.bytDeviceE2E = async (photos) => {
  const { getAi } = initFirebase(import.meta.env as unknown as FirebaseEnv);
  const lm = (globalThis as { LanguageModel?: unknown }).LanguageModel;
  const gate = await checkGate(lm);
  // The cloud model name is never used on device_only; it only completes the set of three models.
  const models = createItemModels(getAi(false), "gemini-3.5-flash-lite", lm);
  const reads: HarnessRead[] = [];
  for (const p of photos) {
    try {
      const r = await readItem(models, { mimeType: "image/jpeg", base64: p.base64 }, "device_only", () => performance.now());
      reads.push({ file: p.file, source: r.source, ms: Math.round(r.ms), recoveredFrom: r.recoveredFrom, error: null,
        itemName: r.read.itemName, category: r.read.category, evidence: r.read.evidence });
    } catch (e) {
      reads.push({ file: p.file, source: null, ms: null, recoveredFrom: null,
        error: e instanceof ReadFailure ? `${e.kind}: ${e.message}` : String(e) });
    }
  }
  return { gate, reads };
};

// The eval's model run (scripts/eval-run.ts). Refuses the live project here too, before any model is made.
window.bytEvalRun = async (input) => {
  const env = import.meta.env as unknown as FirebaseEnv;
  if (!env.VITE_FB_PROJECT_ID || env.VITE_FB_PROJECT_ID === "before-you-tape-2026") throw new Error("the eval runs only against an eval project");
  const { getAi } = initFirebase(env);
  const lm = (globalThis as { LanguageModel?: unknown }).LanguageModel;
  const gate = await checkGate(lm);
  const models = createItemModels(getAi(false), input.cloudModel, lm, input.fallbackModel);
  // Each photo cropped as the app crops an added photo before any model call: the whole photo, 768 px at most.
  const images: Record<string, ImagePart> = {};
  for (const it of input.items) {
    const bytes = Uint8Array.from(atob(it.base64), (c) => c.charCodeAt(0));
    const source = await decodePhoto(new Blob([bytes], { type: "image/jpeg" }));
    images[it.itemId] = await cropToJpeg(source, { x: 0, y: 0, w: 1, h: 1 }, CROP_LIMITS.maxSide, CROP_LIMITS.jpegQuality);
    source.close();
  }
  const out = await evalRows({ set: input.set, edition: parseEdition(input.edition), date: input.date, models, images, now: () => performance.now(), repeat: input.repeat, paths: input.paths });
  return { gate, ...out };
};

document.body.dataset.ready = "1";
