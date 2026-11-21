// The web app's Firestore writes match tests/contracts/box-docs.json, which phone clients follow: npm run test:rules.
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, type Firestore, type Timestamp } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BoxItem, BoxState } from "../../src/data/boxStore";
import { firestorePersistence } from "../../src/data/persistence";

const contract = JSON.parse(readFileSync("tests/contracts/box-docs.json", "utf8")) as {
  box: { doc: Record<string, unknown> }; item: { doc: BoxItem }; expiry: { field: "expiresAt"; boxDays: number };
};
const DAY = 86_400_000;
const unexpired = (d: unknown) => { const { expiresAt: _e, ...rest } = (d ?? {}) as Record<string, unknown>; void _e; return rest; };
let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-before-you-tape", firestore: { rules: readFileSync("firestore.rules", "utf8") } });
});
afterAll(async () => { await env.cleanup(); });

const read = async (path: string) => {
  let out: unknown;
  await env.withSecurityRulesDisabled(async (c) => { out = (await getDoc(doc(c.firestore() as unknown as Firestore, path))).data(); });
  return out;
};

describe("box documents contract", () => {
  it("the web app writes exactly the contract's box and item documents", async () => {
    const db = env.authenticatedContext("owner-uid").firestore() as unknown as Firestore;
    const p = firestorePersistence(db, "owner-uid", "byt-contract");
    expect(await p.loadBox("box-1")).toEqual({ status: "missing" });
    const s = contract.box.doc as { destinationCode: string; sources: BoxState["sources"]; lastRecheckMs: number | null };
    await p.putMeta("box-1", { destinationCode: s.destinationCode, sources: s.sources, lastRecheckMs: s.lastRecheckMs });
    const before = Date.now();
    await p.putItem("box-1", contract.item.doc);
    const box = (await read("boxes/box-1")) as Record<string, unknown>;
    const item = (await read("boxes/box-1/items/item-1")) as Record<string, unknown>;
    expect(unexpired(box)).toEqual(contract.box.doc);
    expect(unexpired(item)).toEqual(contract.item.doc);
    // The expiry the contract describes: the box's creation plus boxDays days, carried by its item exactly.
    const expiresAt = box[contract.expiry.field] as Timestamp;
    expect(expiresAt.toMillis()).toBeGreaterThan(before + (contract.expiry.boxDays - 1) * DAY);
    expect(expiresAt.toMillis()).toBeLessThanOrEqual(Date.now() + contract.expiry.boxDays * DAY);
    expect(item[contract.expiry.field]).toEqual(expiresAt);
  });

  it("the rules accept the contract's item as a phone member would write it", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore() as unknown as Firestore, "boxes/box-2"), { ...contract.box.doc, memberUids: ["owner-uid", "phone-uid"] });
    });
    const phone = env.authenticatedContext("phone-uid").firestore() as unknown as Firestore;
    await setDoc(doc(phone, "boxes/box-2/items/item-1"), contract.item.doc);
  });
});
