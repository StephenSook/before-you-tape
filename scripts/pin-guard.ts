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

// What the whole Remote Config template would publish, after any --set: every pin it names, in a default value, a
// conditional value or a parameter group (clients read all three), must be this checkout's edition, by id and
// hash, and one every live build can read. Catches a pin already in the template, published with --allow, as well
// as one set on the command line.
interface PinValue { defaultValue?: { value?: string }; conditionalValues?: Record<string, unknown> }
interface PinTemplate { parameters?: Record<string, PinValue | undefined>; parameterGroups?: unknown }
const record = (v: unknown): Record<string, unknown> => (v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {});
const text = (v: unknown): string => (typeof v === "string" ? v : "");
// Every value of a pin key, where it sits (the default, or a condition's name, at the top or in a group), empty
// values included.
const placesOf = (t: PinTemplate, key: string): Array<[string, string]> => {
  const groups = Object.entries(record(t.parameterGroups)).map(([g, v]) => [`group ${g}`, record(record(v).parameters)] as const);
  return ([["top", record(t.parameters)] as const, ...groups]).flatMap(([where, ps]) => {
    if (!(key in ps)) return [];
    const p = record(ps[key]);
    return [[`${where} default`, text(record(p.defaultValue).value)] as [string, string],
      ...Object.entries(record(p.conditionalValues)).map(([c, v]) => [`${where} ${c}`, text(record(v).value)] as [string, string])];
  }).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
};
// The id and hash a client sees, for the default and for each condition either key names, at the top and in each
// group: a condition's own value where it has one, else the default (each key on its own).
const pairsOf = (t: PinTemplate): Array<{ where: string; id: string; sha: string }> => {
  const groups = Object.entries(record(t.parameterGroups)).map(([g, v]) => [`group ${g}`, record(record(v).parameters)] as const);
  return ([["top", record(t.parameters)] as const, ...groups]).flatMap(([where, ps]) => {
    if (!("rules_edition_id" in ps) && !("rules_edition_sha256" in ps)) return [];
    const id = record(ps.rules_edition_id);
    const sha = record(ps.rules_edition_sha256);
    const conds = new Set([...Object.keys(record(id.conditionalValues)), ...Object.keys(record(sha.conditionalValues))]);
    const seen = (p: Record<string, unknown>, c?: string) => {
      const own = c === undefined ? undefined : record(p.conditionalValues)[c];
      return text(record(own === undefined ? p.defaultValue : own).value);
    };
    return [{ where: `${where} default`, id: seen(id), sha: seen(sha) },
      ...[...conds].sort().map((c) => ({ where: `${where} ${c}`, id: seen(id, c), sha: seen(sha, c) }))];
  });
};
export function checkTemplatePin(t: PinTemplate, local: { editionId: string }, localSha: string, liveFacts: ReadonlySet<string> = LIVE_FACTS): void {
  // Wherever a client sees an id, it must be this checkout's edition, with its hash beside it.
  const pinned = pairsOf(t).filter((p) => p.id !== "");
  if (pinned.length === 0) return;
  for (const p of pinned) {
    if (p.id !== local.editionId) throw new Error(`rules_edition_id ${p.id} (${p.where}) is not the edition in rules/edition.json (${local.editionId}); check out the commit that built it, so its facts can be checked`);
    if (p.sha !== localSha) throw new Error(`rules_edition_sha256 ${p.sha || "(empty)"} (${p.where}) is not the hash of the edition in rules/edition.json (${localSha})`);
  }
  const why = pinRefusal(local, liveFacts);
  if (why) throw new Error(`Refused: rules_edition_id ${local.editionId} cannot be pinned: ${why}`);
}

// Before a publish: a pin left exactly as it is live is no new pin and is not checked, so a kill_cloud flip from a
// checkout holding a newer edition can keep the live pin (rc-publish --keep-live-pin). Any other pin, set on the
// command line or already in the template, is checked.
const pinOf = (t: PinTemplate) => JSON.stringify([placesOf(t, "rules_edition_id"), placesOf(t, "rules_edition_sha256")]);
export function checkPublishPin(local: PinTemplate, live: PinTemplate, sets: Record<string, string>, edition: { editionId: string },
  localSha: string, liveFacts: ReadonlySet<string> = LIVE_FACTS): void {
  if (pinOf(local) === pinOf(live)) return;
  checkPinSet(sets, edition, liveFacts);
  checkTemplatePin(local, edition, localSha, liveFacts);
}
