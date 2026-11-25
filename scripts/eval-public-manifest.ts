// Writes eval/set/manifest.public.json: the copy of the eval set manifest the web app ships. It leaves out each
// photo's own description (alt) and the download address of its original (provenance.fileUrl), which name brands,
// makers and models, and links each Wikimedia Commons source by its page id (eval/set/commons-pageids.json), which
// opens the same file page without the file name. Everything else is the manifest's own value. The eval, the
// scripts and the measured set keep using eval/set/manifest.json.
//   npx tsx scripts/eval-public-manifest.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { PublicSetManifest, SetManifest } from "../src/eval/loadSet";
import { repoRoot } from "./lib/files";

const COMMONS_FILE = "https://commons.wikimedia.org/wiki/File:";
export const commonsPage = (pageid: number) => `https://commons.wikimedia.org/w/index.php?curid=${pageid}`;

export function publicManifest(manifest: SetManifest, pages: Readonly<Record<string, { pageid: number }>>): PublicSetManifest {
  return {
    ...manifest,
    items: manifest.items.map(({ alt, provenance: { fileUrl, ...provenance }, ...item }) => {
      void alt;
      void fileUrl;
      if (!provenance.sourcePage.startsWith(COMMONS_FILE)) return { ...item, provenance };
      const page = pages[item.itemId];
      if (!page) throw new Error(`${item.itemId}: no Commons page id for ${provenance.sourcePage}`);
      return { ...item, provenance: { ...provenance, sourcePage: commonsPage(page.pageid) } };
    }),
  };
}

function main(): void {
  const read = (p: string) => JSON.parse(readFileSync(join(repoRoot(), p), "utf8"));
  const out = publicManifest(read("eval/set/manifest.json") as SetManifest, read("eval/set/commons-pageids.json").pages);
  writeFileSync(join(repoRoot(), "eval", "set", "manifest.public.json"), `${JSON.stringify(out, null, 2)}\n`);
  console.log(`wrote eval/set/manifest.public.json (${out.items.length} photos)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
