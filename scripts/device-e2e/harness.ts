// Browser side of scripts/device-e2e.ts, served by the Vite dev server only. It runs the real read
// pipeline on the device_only route, so a pass means the app's own code read the photo on the device.
import { createItemModels } from "../../src/ai/firebaseModels";
import { checkGate } from "../../src/ai/gate";
import { readItem, ReadFailure } from "../../src/ai/itemRead";
import { initFirebase, type FirebaseEnv } from "../../src/firebase/app";

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

declare global {
  interface Window {
    bytDeviceE2E: (photos: Photo[]) => Promise<{ gate: string; reads: HarnessRead[] }>;
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

document.body.dataset.ready = "1";
