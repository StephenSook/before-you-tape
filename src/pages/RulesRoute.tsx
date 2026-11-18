// /rules with the rule edition built into the app, the same one the pack page uses unless a newer
// published edition is pinned and verifies.
import bundledEdition from "../../rules/edition.json";
import destinationIndex from "../../rules/destinations/index.json";
import { parseEdition } from "../engine/edition";
import { RulesPage } from "./RulesPage";

const edition = parseEdition(bundledEdition);

export function RulesRoute() {
  return <RulesPage edition={edition} index={destinationIndex} />;
}
