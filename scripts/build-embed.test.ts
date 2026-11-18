import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import edition from "../rules/edition.json";

const root = process.cwd();
const build = (outDir: string, entry?: string, env: NodeJS.ProcessEnv = process.env) =>
  spawnSync("sh", ["scripts/build-embed.sh", outDir, ...(entry ? [entry] : [])], { cwd: root, encoding: "utf8", env });

interface Manifest { bridgeVersion: number; sha256: string; bytes: number; esbuild: string; commit: string; dirty: boolean; inputs: string[] }

describe("scripts/build-embed.sh", () => {
  it("bundles only allowed inputs and no browser or Firebase code", () => {
    const out = mkdtempSync(join(tmpdir(), "byt-embed-"));
    try {
      const r = build(out);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      const js = readFileSync(join(out, "byt-engine.js"));
      const m = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")) as Manifest;
      expect(m.sha256).toBe(createHash("sha256").update(js).digest("hex"));
      expect(m.bytes).toBe(js.length);
      expect(m.bytes).toBeGreaterThan(20_000);
      expect(m.bytes).toBeLessThan(300_000);
      expect(m.bridgeVersion).toBe(1);
      expect(m.esbuild).toMatch(/^\d+\.\d+\.\d+$/);
      expect(m.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(m.inputs).toContain("src/embed/bridge.ts");
      for (const input of m.inputs) expect(input).toMatch(/^src\/(engine|shared|embed)\//);
      expect(js.toString("utf8")).not.toMatch(/firebase|document\.|window\.|crypto\.subtle|fetch\(/);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("the bundle runs in a bare JavaScript context, with no structuredClone", () => {
    const out = mkdtempSync(join(tmpdir(), "byt-embed-"));
    try {
      expect(build(out).status).toBe(0);
      const js = readFileSync(join(out, "byt-engine.js"), "utf8");
      const ctx: Record<string, unknown> = {};
      expect(runInNewContext("typeof structuredClone", ctx)).toBe("undefined");
      runInNewContext(js, ctx);
      const set = JSON.parse(runInNewContext(`BYT.setEdition(${JSON.stringify(JSON.stringify(edition))})`, ctx) as string) as { ok: boolean };
      expect(set.ok).toBe(true);
      expect(runInNewContext("BYT.BRIDGE_VERSION", ctx)).toBe(1);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("a planted firebase import fails the build", () => {
    const dir = join(root, "node_modules", ".cache", "byt-embed-test");
    const out = mkdtempSync(join(tmpdir(), "byt-embed-"));
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "planted.ts"), 'import "firebase/app";\nexport * from "../../../src/embed/bridge";\n');
      const r = build(out, "node_modules/.cache/byt-embed-test/planted.ts");
      expect(r.status, r.stdout + r.stderr).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("says to run npm ci when esbuild is missing", () => {
    const out = mkdtempSync(join(tmpdir(), "byt-embed-"));
    try {
      const r = build(out, undefined, { ...process.env, BYT_ESBUILD: "/no/such/esbuild" });
      expect(r.status).toBe(2);
      expect(r.stdout + r.stderr).toMatch(/npm ci/);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("a bundle that can reach the network or browser storage fails the build", () => {
    const out = mkdtempSync(join(tmpdir(), "byt-embed-"));
    const planted = join(root, "src", "embed", ".planted-api.ts");
    try {
      for (const api of ["new XMLHttpRequest()", "new WebSocket(\"wss://x\")", "navigator.userAgent", "localStorage.length", "indexedDB.open(\"x\")"]) {
        writeFileSync(planted, `export * from "./bridge";\nexport const leak = () => ${api};\n`);
        const r = build(out, "src/embed/.planted-api.ts");
        expect(r.status, api).toBe(1);
        expect(r.stderr, api).toMatch(/the bundle holds/);
      }
    } finally {
      rmSync(planted, { force: true });
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("a bundle that is not the bridge fails the build", () => {
    const out = mkdtempSync(join(tmpdir(), "byt-embed-"));
    try {
      const r = build(out, "src/engine/verdict.ts");
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stderr).toMatch(/does not export the bridge/);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
