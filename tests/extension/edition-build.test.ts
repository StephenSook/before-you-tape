// @vitest-environment node
import { readFileSync } from "node:fs";
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
