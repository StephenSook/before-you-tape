// The live read's real parts, loaded by /judge only when its button is pressed: the same Firebase AI Logic
// models (App Check, anonymous sign-in), Remote Config and device consent the Pack page uses, and the tracked
// sample photo, checked byte for byte against its record before it is read.
import manifest from "../../eval/set/manifest.json";
import { checkGate } from "../ai/gate";
import type { ImagePart } from "../ai/port";
import { cropToJpeg, decodePhoto } from "../capture/crop";
import type { ConfigSource } from "../config/remoteConfig";
import { buildDeps } from "../pages/packDeps";
import { CROP_LIMITS } from "../shared/cropLimits";
import { SampleMismatch, type LiveReadDeps } from "./LiveReadPanel";

const SAMPLE_ITEM = manifest.items.find((i) => i.itemId === "own-18")!;
const WHOLE_PHOTO = { x: 0, y: 0, w: 1, h: 1 };
// Remote Config usually answers within a second or two; settings still missing after this count as paused.
const SETTINGS_WAIT_MS = 10_000;

const sha256 = async (bytes: ArrayBuffer): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");

type Crop = (source: ImageBitmap, box: typeof WHOLE_PHOTO) => Promise<ImagePart>;

// Fetches the sample, refuses it unless its bytes are the record's, and crops it whole as "Try a sample photo" does.
export function sampleReader(sample: { url: string; sha256: string }, fetchBytes: (url: string) => Promise<ArrayBuffer>,
  decode: (file: Blob) => Promise<ImageBitmap> = decodePhoto,
  crop: Crop = (source, box) => cropToJpeg(source, box, CROP_LIMITS.maxSide, CROP_LIMITS.jpegQuality)) {
  return async (): Promise<ImagePart> => {
    const bytes = await fetchBytes(sample.url);
    if ((await sha256(bytes)) !== sample.sha256) throw new SampleMismatch();
    const source = await decode(new Blob([bytes], { type: "image/jpeg" }));
    try {
      return await crop(source, WHOLE_PHOTO);
    } finally {
      source.close();
    }
  };
}

// Waits for Remote Config's settings, with a limit, then says whether cloud checks are paused. Settings that have
// not arrived count as paused, as they do on the Pack page.
export async function pausedAfterSettings(source: ConfigSource, ms = SETTINGS_WAIT_MS): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([source.ready, new Promise<void>((done) => { timer = setTimeout(done, ms); })]);
  clearTimeout(timer);
  return source.get().killCloud;
}

const fetchBytes = async (url: string): Promise<ArrayBuffer> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sample photo: HTTP ${res.status}`);
  return res.arrayBuffer();
};

export async function loadLiveReadDeps(): Promise<LiveReadDeps> {
  const deps = buildDeps();
  if (deps instanceof Error) throw deps;
  return {
    gate: () => checkGate(deps.lm),
    consent: { get: () => deps.store.consentNow(), set: (v) => deps.store.setConsent(v) },
    paused: () => pausedAfterSettings(deps.source),
    models: () => { const c = deps.source.get(); return deps.makeModels(c.cloudModelItem, c.cloudModelItemFallback); },
    sample: sampleReader({ url: SAMPLE_ITEM.photo, sha256: SAMPLE_ITEM.photoSha256 }, fetchBytes),
  };
}
