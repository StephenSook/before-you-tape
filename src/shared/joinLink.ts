// The link a laptop shows as a QR code so a phone can join its box: <origin>/?join=<boxId>.<key>. The key is
// 26 characters of Crockford base32 (128 random bits). Plain string code, no URL or DOM API, so the phone
// apps run the same parser through the engine bundle; tests/vectors/join-links.json is shared with them.

// One canonical origin: the laptop always makes links on it, and the phone apps' app-link files live there.
export const JOIN_ORIGINS = ["https://before-you-tape-2026.web.app"] as const;

const BOX_ID = /^[A-Za-z0-9-]{1,64}$/;
const KEY = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const LINK = /^(https?:\/\/[^/?#]+)\/?\?join=([^&#]*)$/;

export function makeJoinLink(origin: string, boxId: string, key: string): string {
  return `${origin.replace(/\/$/, "")}/?join=${boxId}.${key}`;
}

// The box id and key, or null for anything that is not a well-formed join link from one of these origins.
export function parseJoinLink(link: string, extraOrigins: readonly string[] = []): { boxId: string; key: string } | null {
  const m = LINK.exec(link.trim());
  if (!m) return null;
  const [, origin, value] = m as unknown as [string, string, string];
  if (![...JOIN_ORIGINS, ...extraOrigins].includes(origin)) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const boxId = value.slice(0, dot);
  const key = value.slice(dot + 1).toUpperCase();
  return BOX_ID.test(boxId) && KEY.test(key) ? { boxId, key } : null;
}
