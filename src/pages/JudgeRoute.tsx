// /judge with the rule edition built into the app and the countries whose rules it carries. Nothing here
// signs in, opens a camera or calls a model.
import manifest from "../../eval/set/manifest.json";
import bundledEdition from "../../rules/edition.json";
import destinationIndex from "../../rules/destinations/index.json";
import { parseEdition } from "../engine/edition";
import { pickRecordedReads } from "../judge/recordedReads";
import { localDay } from "../shared/localDay";
import { JudgePage } from "./JudgePage";

const edition = parseEdition(bundledEdition);
// The tracked on-device records (scripts/device-e2e.ts writes them); only one that qualifies is shown.
const records = Object.values(import.meta.glob("../../evidence/device-e2e/*.json", { eager: true, import: "default" }));
const recorded = pickRecordedReads(records, new Set(manifest.items.map((i) => i.itemId)));

export function JudgeRoute() {
  return <JudgePage edition={edition} index={destinationIndex} today={localDay()} recorded={recorded} />;
}
