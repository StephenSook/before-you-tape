// Photo check for the published eval photos: every file in public/eval/items is a JPEG with no Exif, XMP
// or IPTC block (so no camera, date or location travels with it), and its SHA-256 equals the manifest's.
// Exits 1 on any problem. Run: npx tsx scripts/photo-check.ts
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Walks the JPEG segments up to the image data and names each metadata block it finds.
export function jpegMetadataBlocks(buf: Buffer): string[] {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error("not a JPEG");
  const found: string[] = [];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) throw new Error(`not a JPEG segment at byte ${i}`);
    const marker = buf[i + 1]!;
    if (marker === 0xda || marker === 0xd9) break;
    const len = (buf[i + 2]! << 8) | buf[i + 3]!;
    const body = buf.subarray(i + 4, i + 2 + len);
    const head = body.subarray(0, 40).toString("latin1");
    if (marker === 0xe1 && head.startsWith("Exif\0")) found.push("Exif");
    else if (marker === 0xe1 && head.startsWith("http://ns.adobe.com/xap/1.0/")) found.push("XMP");
    else if (marker === 0xed) found.push("IPTC");
    i += 2 + len;
  }
  return found;
}

interface ManifestItem { itemId: string; photo: string; photoSha256: string }

function main(): void {
  const manifestPath = "eval/set/manifest.json";
  if (!existsSync(manifestPath)) throw new Error(`${manifestPath} does not exist yet`);
  const items = (JSON.parse(readFileSync(manifestPath, "utf8")) as { items: ManifestItem[] }).items;
  const problems: string[] = [];
  for (const it of items) {
    const file = join("public", it.photo.replace(/^\//, ""));
    if (!existsSync(file)) { problems.push(`${it.itemId}: ${file} is missing`); continue; }
    const buf = readFileSync(file);
    try {
      const blocks = jpegMetadataBlocks(buf);
      if (blocks.length) problems.push(`${it.itemId}: carries ${blocks.join(", ")}`);
    } catch (e) {
      problems.push(`${it.itemId}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (createHash("sha256").update(buf).digest("hex") !== it.photoSha256) problems.push(`${it.itemId}: SHA-256 does not match the manifest`);
  }
  for (const p of problems) console.error(p);
  console.log(`photo check: ${items.length} photos, ${problems.length} problems`);
  if (problems.length || items.length === 0) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1); }
}
