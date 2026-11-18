// Writes public/eval/sets/<setId>.json, the file the private blind check loads, from eval/set/manifest.json.
// Run: npx tsx scripts/eval-blind-set.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { blindSetOf } from "../src/eval/blindSet";
import type { SetManifest } from "../src/eval/loadSet";

const manifest = JSON.parse(readFileSync("eval/set/manifest.json", "utf8")) as SetManifest;
const out = `public/eval/sets/${manifest.setId}.json`;
mkdirSync("public/eval/sets", { recursive: true });
writeFileSync(out, JSON.stringify(blindSetOf(manifest), null, 2) + "\n");
console.log(`wrote ${out} (${manifest.items.length} items)`);
