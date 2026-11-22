// A pin can switch live app builds to a newer rule edition without a new build. A build whose engine does not know a
// fact the edition reads refuses that edition and falls back to its built-in one, which can be older than the edition
// pinned before (android-judge-3's is revision 4). So a pin may only name an edition whose facts every live build
// knows; rules/live-engines.json lists them.
import liveEngines from "../rules/live-engines.json";

const LIVE_FACTS: ReadonlySet<string> = new Set(liveEngines.facts);

// Every fact an edition's predicates read, anywhere in it.
export function factsOf(raw: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v === null || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (typeof o.fact === "string") out.add(o.fact);
    Object.values(o).forEach(walk);
  };
  walk(raw);
  return out;
}

export function factsBeyondLiveEngines(raw: unknown, liveFacts: ReadonlySet<string> = LIVE_FACTS): string[] {
  return [...factsOf(raw)].filter((f) => !liveFacts.has(f)).sort();
}

export function pinRefusal(raw: unknown, liveFacts: ReadonlySet<string> = LIVE_FACTS): string | null {
  const beyond = factsBeyondLiveEngines(raw, liveFacts);
  return beyond.length === 0 ? null
    : `it reads ${beyond.join(", ")}, which the engine in ${liveEngines.builds.join(" and ")} does not know; those builds would refuse it and fall back to their built-in edition (rules/live-engines.json)`;
}

// rc-publish --set rules_edition_id=X: X must be this checkout's edition, so its facts can be checked.
export function checkPinSet(sets: Record<string, string>, local: { editionId: string }, liveFacts: ReadonlySet<string> = LIVE_FACTS): void {
  const id = sets.rules_edition_id;
  if (id === undefined || id === "") return;
  if (id !== local.editionId) throw new Error(`rules_edition_id ${id} is not the edition in rules/edition.json (${local.editionId}); check out the commit that built it, so its facts can be checked`);
  const why = pinRefusal(local, liveFacts);
  if (why) throw new Error(`Refused: rules_edition_id ${id} cannot be pinned: ${why}`);
}

// What the whole Remote Config template would publish, after any --set: the pin it names must be this checkout's
// edition (by id and hash) and one every live build can read. Catches a pin already in the template, published with
// --allow, as well as one set on the command line.
interface PinTemplate { parameters?: Record<string, { defaultValue?: { value?: string } } | undefined> }
export function checkTemplatePin(t: PinTemplate, local: { editionId: string }, localSha: string, liveFacts: ReadonlySet<string> = LIVE_FACTS): void {
  const id = t.parameters?.rules_edition_id?.defaultValue?.value ?? "";
  if (id === "") return;
  const sha = t.parameters?.rules_edition_sha256?.defaultValue?.value ?? "";
  if (id !== local.editionId) throw new Error(`rules_edition_id ${id} is not the edition in rules/edition.json (${local.editionId}); check out the commit that built it, so its facts can be checked`);
  if (sha !== localSha) throw new Error(`rules_edition_sha256 ${sha || "(empty)"} is not the hash of the edition in rules/edition.json (${localSha})`);
  const why = pinRefusal(local, liveFacts);
  if (why) throw new Error(`Refused: rules_edition_id ${id} cannot be pinned: ${why}`);
}
