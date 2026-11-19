// The web app's Firestore writes match tests/contracts/box-docs.json, which phone clients follow: npm run test:rules.
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BoxItem, BoxState } from "../../src/data/boxStore";
import { firestorePersistence } from "../../src/data/persistence";

const contract = JSON.parse(readFileSync("tests/contracts/box-docs.json", "utf8")) as {
  box: { doc: Record<string, unknown> }; item: { doc: BoxItem };
};
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
    await p.load("box-1");
    const s = contract.box.doc;
    p.save({
      boxId: "box-1", destinationCode: s.destinationCode, cloudConsent: true, sources: s.sources, lastRecheckMs: s.lastRecheckMs,
      items: [contract.item.doc], errors: {}, result: {},
    } as unknown as BoxState);
    await p.idle();
    expect(p.lastError()).toBeNull();
    expect(await read("boxes/box-1")).toEqual(contract.box.doc);
    expect(await read("boxes/box-1/items/item-1")).toEqual(contract.item.doc);
  });

  it("the rules accept the contract's item as a phone member would write it", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore() as unknown as Firestore, "boxes/box-2"), { ...contract.box.doc, memberUids: ["owner-uid", "phone-uid"] });
    });
    const phone = env.authenticatedContext("phone-uid").firestore() as unknown as Firestore;
    await setDoc(doc(phone, "boxes/box-2/items/item-1"), contract.item.doc);
  });
});
