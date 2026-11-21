import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const extensionDir = fileURLToPath(new URL("../extension/", import.meta.url));
export const buildDir = join(extensionDir, "dist");
export const draftVersion = "0.0.1";

// Measured 2026-11-18: the typed draft contains 7 files and 292,471 bytes.
export const packageLimits = { minFiles: 7, maxBytes: 384 * 1024 };

const permissions = ["activeTab", "sidePanel", "storage"];
const forbiddenManifestKeys = [
  "host_permissions", "optional_host_permissions", "optional_permissions", "content_scripts", "key",
  "externally_connectable", "content_security_policy", "web_accessible_resources",
];
const forbiddenContents: [string, RegExp][] = [
  ["reCAPTCHA", /recaptcha/i],
  ["Google API scripts", /apis\.google\.com\/js/i],
  ["Firebase CDN scripts", /gstatic\.com\/firebasejs/i],
  ["App Check debug tokens", /FIREBASE_APPCHECK_DEBUG_TOKEN/i],
  ["provider credentials", /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\bAIza[\w-]{35}\b|"type"\s*:\s*"service_account"|"private_key"\s*:|"client_secret"\s*:)/],
  ["dynamic JavaScript", /\beval\s*\(|\bnew\s+Function\s*\(/],
  ["remote script", /<script\b[^>]*\bsrc\s*=\s*["']?(?:https?:)?\/\//i],
];

export function packageFiles(dir: string, prefix = ""): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (!/^[\w.-]+$/.test(entry.name) || !/^[\w]/.test(entry.name)) throw new Error(`Invalid package path: ${path}.`);
    if (entry.isDirectory()) files.push(...packageFiles(dir, `${path}/`));
    else if (entry.isFile()) files.push(path);
    else throw new Error(`Expected a regular file: ${path}.`);
  }
  return files.sort();
}

export function releaseVersion(): string {
  const changelog = readFileSync(join(extensionDir, "CHANGELOG.md"), "utf8");
  const version = /^## (\d+\.\d+\.\d+)[ \t]*$/m.exec(changelog)?.[1];
  if (!version) throw new Error("The extension changelog has no version.");
  return version;
}

type PackageCheck = { ok: boolean; messages: string[] };

export function checkPackage(dir: string, { minFiles, maxBytes }: typeof packageLimits): PackageCheck {
  const messages: string[] = [];
  try {
    const files = packageFiles(dir);
    if (files.length < minFiles) messages.push(`Found ${files.length} files, expected at least ${minFiles}.`);
    const bytes = files.reduce((total, file) => total + statSync(join(dir, file)).size, 0);
    if (bytes > maxBytes) {
      messages.push(`Found ${bytes} bytes, expected at most ${maxBytes}.`);
      return { ok: false, messages };
    }

    const contents = new Map(files.map((file) => [file, readFileSync(join(dir, file), "utf8")]));
    for (const [file, content] of contents) {
      for (const [label, pattern] of forbiddenContents) {
        if (pattern.test(content)) messages.push(`${file}: contains ${label}.`);
      }
    }

    const manifest: unknown = JSON.parse(contents.get("manifest.json") ?? "null");
    if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
      messages.push("Expected a manifest.json object.");
      return { ok: false, messages };
    }
    const version = inspectManifest(manifest as Record<string, unknown>, contents, messages);
    const code = files.filter((file) => file.endsWith(".js")).map((file) => contents.get(file)).join("\n");
    const worker = contents.get("background.js") ?? "";
    if (!/\.action\s*\.\s*onClicked\b/.test(worker)) messages.push("The worker does not use activeTab through action.onClicked.");
    if (!/\.sidePanel\s*\.\s*open\b/.test(worker)) messages.push("The worker does not use sidePanel.");
    if (!/\bstorage\b/.test(code)) messages.push("The bundle does not use storage.");

    // The typed draft predates Task 6. Store versions must show the two actual on-device controls.
    const controls = version === draftVersion ? ["Take it out"] : ["Take it out", "only_on_device", "LanguageModel"];
    for (const control of controls) {
      if (!code.includes(control)) messages.push(`Missing positive control: ${control}.`);
    }
  } catch (error) {
    messages.push(error instanceof Error ? error.message : String(error));
  }
  return { ok: messages.length === 0, messages };
}

function inspectManifest(manifest: Record<string, unknown>, files: Map<string, string>, messages: string[]): unknown {
  if (manifest.manifest_version !== 3) messages.push("Expected Manifest V3.");
  const expected = releaseVersion();
  if (manifest.version !== expected) messages.push(`Manifest version must match the changelog (${expected}).`);
  const actualPermissions: unknown = manifest.permissions;
  if (!Array.isArray(actualPermissions) || actualPermissions.length !== permissions.length
    || !permissions.every((permission) => actualPermissions.includes(permission))) {
    messages.push("Manifest permissions must be exactly activeTab, sidePanel and storage.");
  }
  for (const key of forbiddenManifestKeys) {
    if (Object.hasOwn(manifest, key)) messages.push(`Forbidden manifest key: ${key}.`);
  }
  const worker = manifest.background as { service_worker?: unknown; type?: unknown } | undefined;
  if (worker?.service_worker !== "background.js" || worker.type !== "module" || !files.has("background.js")) {
    messages.push("Expected background.js as the manifest's module worker.");
  }
  const panel = manifest.side_panel as { default_path?: unknown } | undefined;
  if (panel?.default_path !== "sidepanel.html" || !files.has("sidepanel.html") || !files.has("extension-privacy.html")) {
    messages.push("Expected the manifest's side panel and the packaged privacy page.");
  }
  return manifest.version;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const dir = process.argv[2] ?? buildDir;
  const result = checkPackage(dir, packageLimits);
  for (const message of result.messages) console.error(message);
  if (result.ok) console.log(`ext check: ${packageFiles(dir).length} files, clean`);
  process.exitCode = result.ok ? 0 : 1;
}
