// Builds rules/edition.json from the part files in rules/. With --check it builds in memory
// and exits 1 when the committed edition.json differs, so CI catches a stale edition.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson, parseEdition, sha256Hex } from "../src/engine/edition";
import { repoRoot } from "./lib/files";

const root = repoRoot();
const rulesDir = join(root, "rules");
const read = (name: string): unknown => JSON.parse(readFileSync(join(rulesDir, name), "utf8"));

function destinations(): Record<string, unknown> {
  const dir = join(rulesDir, "destinations");
  const out: Record<string, unknown> = {};
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".json") || name === "index.json") continue;
    out[name.replace(/\.json$/, "")] = JSON.parse(readFileSync(join(dir, name), "utf8"));
  }
  return out;
}

async function build(): Promise<string> {
  const body = {
    revision: (read("revision.json") as { revision: number }).revision,
    service: "Priority Mail International",
    sources: read("sources.json"),
    limits: read("limits.json"),
    categoryTags: read("category-tags.json"),
    labelWords: read("label-words.json"),
    questions: read("questions.json"),
    rules: read("usps-export.json"),
    destinations: destinations(),
    suspensions: read("suspensions.json"),
    stopWords: read("stop-words.json"),
    worksheetFields: read("worksheet-fields.json"),
  };
  // The id comes from the content, so the same parts always build the same edition.
  const editionId = "byt-" + (await sha256Hex(canonicalJson(body))).slice(0, 12);
  const edition = parseEdition({ editionId, ...body });
  return JSON.stringify(edition, null, 2) + "\n";
}

async function main(): Promise<void> {
  const target = join(rulesDir, "edition.json");
  const text = await build();
  if (process.argv.includes("--check")) {
    const committed = existsSync(target) ? readFileSync(target, "utf8") : "";
    if (committed !== text) {
      console.error("rules/edition.json is out of date. Run: npm run edition");
      process.exit(1);
    }
    console.log("rules/edition.json is up to date");
    return;
  }
  writeFileSync(target, text);
  console.log(`wrote rules/edition.json (${JSON.parse(text).editionId})`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
