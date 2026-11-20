// /judge with the rule edition built into the app and the countries whose rules it carries. Nothing here
// signs in, opens a camera or calls a model.
import bundledEdition from "../../rules/edition.json";
import destinationIndex from "../../rules/destinations/index.json";
import { parseEdition } from "../engine/edition";
import { localDay } from "../shared/localDay";
import { JudgePage } from "./JudgePage";

const edition = parseEdition(bundledEdition);

export function JudgeRoute() {
  return <JudgePage edition={edition} index={destinationIndex} today={localDay()} />;
}
