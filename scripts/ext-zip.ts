import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildDir, checkPackage, draftVersion, extensionDir, packageFiles, packageLimits, releaseVersion } from "./ext-check";

function main(): void {
  const check = checkPackage(buildDir, packageLimits);
  if (!check.ok) throw new Error(check.messages.join("\n"));

  const version = releaseVersion();
  const outputDir = join(extensionDir, "out");
  const name = `byt-extension-${version}.zip`;
  mkdirSync(outputDir, { recursive: true });
  const tempDir = mkdtempSync(join(outputDir, "zip-"));
  const archive = join(tempDir, name);
  try {
    execFileSync("zip", ["-q", "-X", archive, "-@"], {
      cwd: buildDir, input: packageFiles(buildDir).join("\n") + "\n",
    });
    const hash = createHash("sha256").update(readFileSync(archive)).digest("hex");
    renameSync(archive, join(outputDir, name));
    console.log(`extension/out/${name}${version === draftVersion ? " (typed draft)" : ""}`);
    console.log(`SHA-256 ${hash}`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
