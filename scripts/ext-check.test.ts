// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import sourceManifest from "../extension/manifest.json";
import { checkPackage, packageLimits } from "./ext-check";

const dirs: string[] = [];
const limits = { minFiles: 5, maxBytes: 8_000 };

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "byt-ext-check-"));
  dirs.push(dir);
  return dir;
}

function fixture(changes: Record<string, unknown> = {}): string {
  const dir = scratch();
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ ...sourceManifest, ...changes }));
  writeFileSync(join(dir, "background.js"), "chrome.action.onClicked.addListener(() => chrome.sidePanel.open({}));");
  writeFileSync(join(dir, "sidepanel.html"), '<script type="module" src="./sidepanel.js"></script>');
  writeFileSync(join(dir, "sidepanel.js"), 'chrome.storage.local.get([]); document.title = "Take it out";');
  writeFileSync(join(dir, "extension-privacy.html"), "<h1>Privacy</h1>");
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

it("fails on a reCAPTCHA URL in the zip", () => {
  const dir = fixture();
  expect(checkPackage(dir, limits).ok).toBe(true);
  writeFileSync(join(dir, "bad.js"), "https://www.google.com/recaptcha/enterprise.js");
  expect(checkPackage(dir, limits).messages.join(" ")).toMatch(/bad\.js.*recaptcha/i);
});

it("fails on an unused permission", () => {
  const dir = fixture();
  writeFileSync(join(dir, "background.js"), "chrome.sidePanel.open({});");
  expect(checkPackage(dir, limits).messages.join(" ")).toMatch(/activeTab/);
  expect(checkPackage(fixture({ permissions: [...sourceManifest.permissions, "tabs"] }), limits).ok).toBe(false);
});

it("fails when the manifest carries a key", () => {
  expect(checkPackage(fixture({ key: "abc" }), limits).messages.join(" ")).toMatch(/manifest.*key/i);
});

it("fails on an empty or tiny package", () => {
  expect(checkPackage(scratch(), limits).messages.join(" ")).toMatch(/expected at least/);
});

it("fails when a positive control string is missing", () => {
  const dir = fixture();
  writeFileSync(join(dir, "sidepanel.js"), "chrome.storage.local.get([]);");
  expect(checkPackage(dir, limits).messages.join(" ")).toMatch(/Take it out/);
});

it("requires both on-device controls for a store version", () => {
  const dir = fixture({ version: "0.1.0" });
  const messages = checkPackage(dir, limits).messages.join(" ");
  expect(messages).toContain("only_on_device");
  expect(messages).toContain("LanguageModel");
});

it("fails on oversized packages and symbolic links", () => {
  const dir = fixture();
  expect(checkPackage(dir, { ...limits, maxBytes: 1 }).messages.join(" ")).toMatch(/expected at most/);
  symlinkSync(join(dir, "sidepanel.js"), join(dir, "extra.js"));
  expect(checkPackage(dir, limits).messages.join(" ")).toMatch(/extra\.js/);
});

it("passes the real build", () => {
  const dir = scratch();
  execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build", "-c", "extension/vite.config.ts", "--outDir", dir, "--emptyOutDir"], {
    env: { ...process.env, NODE_ENV: "production" },
  });
  expect(checkPackage(dir, packageLimits)).toEqual({ ok: true, messages: [] });
  expect(readFileSync(join(dir, "extension-privacy.html"), "utf8")).toEqual(readFileSync("public/extension-privacy.html", "utf8"));
});
