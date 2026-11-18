// Reading a published rule edition from Firestore, against the emulator and the real rules: npm run test:rules.
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bundled from "../../rules/edition.json";
import { canonicalJson, sha256Hex } from "../../src/engine/edition";
import { chooseEdition, firestoreEditionFetcher } from "../../src/data/editionSource";
import { parseEdition } from "../../src/engine/edition";

let env: RulesTestEnvironment;
const newer = { ...(bundled as Record<string, unknown>), editionId: "byt-newer000001" };

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-before-you-tape", firestore: { rules: readFileSync("firestore.rules", "utf8") } });
  const json = canonicalJson(newer);
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore() as unknown as Firestore, "ruleEditions/byt-newer000001"), { json, sha256: await sha256Hex(json) });
    await setDoc(doc(c.firestore() as unknown as Firestore, "ruleEditions/byt-broken"), { json: 42 });
  });
});
afterAll(async () => { await env.cleanup(); });

describe("firestoreEditionFetcher", () => {
  it("returns the published edition exactly, so its hash matches the pin", async () => {
    const fetch = firestoreEditionFetcher(env.authenticatedContext("alice").firestore() as unknown as Firestore);
    const got = await fetch("byt-newer000001");
    expect(canonicalJson(got)).toBe(canonicalJson(newer));
    const chosen = await chooseEdition({
      bundled: parseEdition(bundled), bundledSha: await sha256Hex(canonicalJson(bundled)),
      wantId: "byt-newer000001", wantSha: await sha256Hex(canonicalJson(newer)), fetchRemote: fetch,
    });
    expect(chosen).toMatchObject({ from: "remote", notice: null });
  });

  it("returns nothing for a missing or malformed edition, and refuses a visitor who is not signed in", async () => {
    const fetch = firestoreEditionFetcher(env.authenticatedContext("alice").firestore() as unknown as Firestore);
    expect(await fetch("byt-none")).toBeNull();
    expect(await fetch("byt-broken")).toBeNull();
    await expect(firestoreEditionFetcher(env.unauthenticatedContext().firestore() as unknown as Firestore)("byt-newer000001")).rejects.toMatchObject({ code: "permission-denied" });
  });
});
