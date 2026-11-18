import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { editionSha256, parseEdition } from "../../src/engine/edition";
import { ed } from "../../tests/engine/helpers";
import { checkOne, toBoxItem, typedRead } from "./check";
import { bundledEdition, EDITION_URL, fetchCurrentEdition, loadEdition } from "./edition";

const newer = { ...ed, editionId: "byt-live-test" };
const offline = async () => { throw new Error("offline"); };

it("uses the live edition when it parses", async () => {
  expect(await loadEdition({ bundled: ed, cached: null, fetchJson: async () => newer })).toMatchObject({
    edition: newer, from: "live", notice: null,
  });
});

it("refuses a live edition that fails parseEdition", async () => {
  expect(await loadEdition({ bundled: ed, cached: null, fetchJson: async () => ({ editionId: "x" }) })).toMatchObject({
    from: "bundled", notice: "Could not load the newest rules. Using the built-in rules.",
  });
});

it("falls back to the cached edition, then the bundled one, when offline", async () => {
  expect((await loadEdition({ bundled: ed, cached: newer, fetchJson: offline })).from).toBe("cached");
  expect((await loadEdition({ bundled: ed, cached: null, fetchJson: offline })).from).toBe("bundled");
  expect((await loadEdition({ bundled: ed, cached: {}, fetchJson: offline })).from).toBe("bundled");
});

it("a stale layer is never OK in the panel", () => {
  const item = toBoxItem(typedRead({
    itemName: "Scarf", category: "clothing", volts: 0, milliampHours: 0, wattHours: 0,
    liquid: false, pressurized: false, alcoholOnLabel: false, batteryWords: false,
  }), { confirmed: true, answers: {}, quantity: 1 });
  expect(checkOne(item, ed, "CA", ed.suspensions.checkedOn).level).toBe("ok");
  const stale = checkOne(item, ed, "CA", "2027-06-01");
  expect(stale.level).toBe("check");
  expect(stale.hits.map((hit) => hit.ruleId)).toContain("DATA-LAYER-STALE");
});

it("the bundled edition is the repo's edition", async () => {
  const repoJson: unknown = JSON.parse(readFileSync("rules/edition.json", "utf8"));
  expect(await editionSha256(bundledEdition)).toBe(await editionSha256(parseEdition(repoJson)));
});

it("requests only the public edition without a query or credentials", async () => {
  const fetchJson = vi.fn(async () => new Response(JSON.stringify(newer)));
  const original = globalThis.fetch;
  globalThis.fetch = fetchJson;
  try {
    await expect(fetchCurrentEdition(new AbortController().signal)).resolves.toEqual(newer);
    expect(fetchJson).toHaveBeenCalledExactlyOnceWith(EDITION_URL, expect.objectContaining({
      credentials: "omit", referrerPolicy: "no-referrer", redirect: "error",
    }));
    expect(new URL(EDITION_URL).search).toBe("");
  } finally {
    globalThis.fetch = original;
  }
});
