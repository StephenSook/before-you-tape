// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { expect, it } from "vitest";

it("the web build emits edition.json equal to rules/edition.json", async () => {
  const results = await build({ configFile: "vite.config.ts", logLevel: "silent", build: { write: false } });
  if (!Array.isArray(results) && "output" in results) {
    const edition = results.output.find((entry) => entry.fileName === "edition.json");
    expect(edition?.type).toBe("asset");
    if (edition?.type === "asset") expect(edition.source.toString()).toBe(readFileSync("rules/edition.json", "utf8"));
  } else {
    throw new Error("The web build did not return its output files.");
  }
});

it("builds a hosted bridge entry with a fail-closed embedding policy", async () => {
  const results = await build({ configFile: "vite.config.ts", logLevel: "silent", build: { write: false } });
  if (Array.isArray(results) || !("output" in results)) throw new Error("No web build output.");
  expect(results.output.find((entry) => entry.fileName === "ext-bridge.html")).toMatchObject({ type: "asset" });
  const config = JSON.parse(readFileSync("firebase.json", "utf8"));
  const route = config.hosting.headers.find((entry: { source?: string }) => entry.source === "/ext-bridge.html");
  expect(route?.headers).toContainEqual({ key: "Content-Security-Policy", value: "frame-ancestors 'none'" });
});

// These builds only inspect the bundle, so they must leave every folder as it was: a test run after a real build
// must never replace the built service worker in dist with one made here.
it("a build that writes nothing leaves its output folder empty", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "byt-no-write-"));
  await build({ configFile: "vite.config.ts", logLevel: "silent", build: { write: false, outDir } });
  expect(readdirSync(outDir)).toEqual([]);
});
