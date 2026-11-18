// Opens a camera stream and says plainly why it did not open.

export type CameraErrorKind = "denied" | "none" | "busy";

export class CameraError extends Error {
  override name = "CameraError";
  constructor(readonly kind: CameraErrorKind, message: string) {
    super(message);
  }
}

function kindOf(e: unknown): CameraErrorKind {
  const name = (e as { name?: unknown } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "none";
  return "busy";
}

export async function openCamera(facing: "user" | "environment"): Promise<{ stream: MediaStream; stop(): void }> {
  const media = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  if (!media?.getUserMedia) throw new CameraError("none", "this browser cannot open a camera");
  let stream: MediaStream;
  try {
    stream = await media.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } } });
  } catch (e) {
    const kind = kindOf(e);
    throw new CameraError(kind, e instanceof Error ? e.message : String(e));
  }
  return { stream, stop: () => { for (const t of stream.getTracks()) t.stop(); } };
}
