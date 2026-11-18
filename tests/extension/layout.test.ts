import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readFiles } from "../../scripts/lib/files";
import { GUARD_PATHSPECS } from "../../scripts/model-guard";
import { TONE_PATHSPECS } from "../../scripts/tone-check";

describe("extension layout", () => {
  it("extension has no copy of the engine", () => {
    const files = readFiles(["extension", ":(exclude)extension/dist/**", ":(exclude)extension/out/**"]);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(file.text, file.path).not.toMatch(
        /\b(?:function|const|let|var)\s+(?:evaluateBox|deriveFacts|parseEdition)\b|\b(?:evaluateBox|deriveFacts|parseEdition)\s*=\s*(?:function\b|\([^)]*\)\s*=>)/,
      );
    }
  });

  it("the model guard walks extension files", () => {
    expect(GUARD_PATHSPECS).toContain(":(glob)extension/**");
    expect(GUARD_PATHSPECS).toContain(":(exclude)extension/dist/**");
  });

  it("unit tests and types cover extension", () => {
    expect(readFileSync("vitest.config.ts", "utf8")).toContain("extension/**/*.test.{ts,tsx}");
    expect(JSON.parse(readFileSync("tsconfig.json", "utf8")).include).toContain("extension");
  });

  it("the tone check walks extension copy", () => {
    expect(TONE_PATHSPECS).toContain(":(glob)extension/**");
    expect(TONE_PATHSPECS).toContain("public/extension-privacy.html");
  });
});
