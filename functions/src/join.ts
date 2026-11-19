// The join code a laptop shows so a phone can join its box. The server makes the code, keeps only its
// SHA-256 and when it stops working, and a phone that presents it in time becomes a member. Each code
// works once. Plain functions here; the callables wrap them.
import { createHash, timingSafeEqual } from "node:crypto";

// The laptop and two phones.
export const MAX_MEMBERS = 3;
export const JOIN_KEY_TTL_MS = 10 * 60_000;

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// 16 random bytes, 128 bits, as 26 Crockford base32 characters (the top two bits are always 0).
export function encodeJoinKey(bytes: Uint8Array): string {
  if (bytes.length !== 16) throw new Error("a join key is made from exactly 16 bytes");
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  for (let i = 0; i < 26; i++) {
    out = (CROCKFORD[Number(n & 31n)] as string) + out;
    n >>= 5n;
  }
  return out;
}

export function joinKeyHash(key: string): string {
  return createHash("sha256").update(key.toUpperCase()).digest("hex");
}

export interface JoinableBox {
  ownerUid: string;
  memberUids: string[];
  joinKeyHash: string;
  joinKeyExpiresAt?: number;
}

export type JoinVerdict = "joined" | "already_member" | "no_code" | "wrong_code" | "expired" | "full";

const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function checkJoin(box: JoinableBox, uid: string, keyHash: string, nowMs: number): JoinVerdict {
  if (box.memberUids.includes(uid)) return "already_member";
  if (box.joinKeyHash === "") return "no_code";
  if (!sameHash(box.joinKeyHash, keyHash)) return "wrong_code";
  if (box.joinKeyExpiresAt === undefined || nowMs >= box.joinKeyExpiresAt) return "expired";
  if (box.memberUids.length >= MAX_MEMBERS) return "full";
  return "joined";
}
