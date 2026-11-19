import { describe, expect, it } from "vitest";
import { parseJoinLink, makeJoinLink, JOIN_ORIGINS } from "../../src/shared/joinLink";
import { checkJoin, encodeJoinKey, joinKeyHash, JOIN_KEY_TTL_MS, MAX_MEMBERS, type JoinableBox } from "./join";

const box = (over: Partial<JoinableBox> = {}): JoinableBox => ({
  ownerUid: "owner", memberUids: ["owner"], joinKeyHash: joinKeyHash("A".repeat(26)), joinKeyExpiresAt: 10_000, ...over,
});

describe("encodeJoinKey", () => {
  it("turns 16 random bytes into a 26-character key the join link accepts", () => {
    const key = encodeJoinKey(new Uint8Array(16).fill(255));
    expect(key).toHaveLength(26);
    expect(parseJoinLink(makeJoinLink(JOIN_ORIGINS[0], "box-1", key))).toEqual({ boxId: "box-1", key });
    expect(encodeJoinKey(new Uint8Array(16))).toBe("0".repeat(26));
  });

  it("refuses any other number of bytes", () => {
    expect(() => encodeJoinKey(new Uint8Array(15))).toThrow();
  });
});

describe("joinKeyHash", () => {
  it("is the SHA-256 of the key in capitals, as hex", () => {
    expect(joinKeyHash("abc")).toBe(joinKeyHash("ABC"));
    expect(joinKeyHash("ABC")).toBe("b5d4045c3f466fa91fe2cc6abe79232a1a57cdf104f7a26e716e0a1e2789df78");
  });
});

describe("checkJoin", () => {
  const good = joinKeyHash("A".repeat(26));
  it("lets a phone join with the right code before it expires", () => {
    expect(checkJoin(box(), "phone", good, 9_999)).toBe("joined");
  });

  it("lets a member in again without a code", () => {
    expect(checkJoin(box({ memberUids: ["owner", "phone"], joinKeyHash: "" }), "phone", "", 0)).toBe("already_member");
  });

  it("refuses no code, a wrong code, an expired code, and a full box", () => {
    expect(checkJoin(box({ joinKeyHash: "" }), "phone", good, 0)).toBe("no_code");
    expect(checkJoin(box(), "phone", joinKeyHash("B".repeat(26)), 0)).toBe("wrong_code");
    expect(checkJoin(box(), "phone", good, 10_000)).toBe("expired");
    expect(checkJoin(box({ joinKeyExpiresAt: undefined }), "phone", good, 0)).toBe("expired");
    const full = Array.from({ length: MAX_MEMBERS }, (_, i) => `m${i}`);
    expect(checkJoin(box({ memberUids: full }), "phone", good, 0)).toBe("full");
  });

  it("keeps codes short-lived", () => {
    expect(JOIN_KEY_TTL_MS).toBeLessThanOrEqual(10 * 60_000);
    expect(MAX_MEMBERS).toBe(3);
  });
});
