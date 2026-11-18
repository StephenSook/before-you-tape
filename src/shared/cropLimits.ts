// The one size limit for a crop that leaves a device: only the hold-zone crop is ever sent, never the
// whole frame. Shared by the web app, the phone apps and the server-side AI Logic trigger, so every
// side agrees on the same numbers. No Firebase or DOM imports, so any bundle can embed it.
export const CROP_LIMITS = {
  // Longest side of the crop in pixels.
  maxSide: 768,
  // JPEG quality for the first encode; a crop over the byte cap is re-encoded lower.
  jpegQuality: 0.85,
  // A crop at this size encodes far below this; the server trigger refuses anything above it.
  maxBytes: 500_000,
} as const;
