import { describe, expect, it } from "vitest";
import bundled from "../rules/edition.json";
import live from "../rules/live-engines.json";
import { canonicalJson, sha256Hex } from "../src/engine/edition";
import { checkPinSet, checkPublishPin, checkTemplatePin, factsBeyondLiveEngines, factsOf } from "./pin-guard";

describe("pin guard", () => {
  it("finds every fact an edition's rules and lines read", () => {
    const raw = { rules: [{ when: { all: [{ fact: "category", op: "eq", value: "x" }, { not: { fact: "battery.wh", op: "gt", value: 1 } }] } }],
      destinations: { CA: { lines: [{ matches: { any: [{ fact: "tags", op: "has", value: "y" }] } }] } } };
    expect([...factsOf(raw)].sort()).toEqual(["battery.wh", "category", "tags"]);
  });

  it("names the facts an edition uses that the engine in a live app build does not know", () => {
    expect(factsBeyondLiveEngines({ rules: [{ when: { fact: "category", op: "eq", value: "x" } }] })).toEqual([]);
    expect(factsBeyondLiveEngines({ rules: [{ when: { fact: "battery.numbersFrom", op: "eq", value: "typed" } }] })).toEqual(["battery.numbersFrom"]);
    // This build's edition reads battery.numbersFrom, which android-judge-3 and iPhone build 2 refuse.
    expect(factsBeyondLiveEngines(bundled)).toEqual(["battery.numbersFrom"]);
    expect(live.builds).toEqual(expect.arrayContaining(["android-judge-3", "android-judge-4", "android-judge-5", "android-judge-6", "android-judge-7", "iPhone build 2"]));
  });

  it("refuses a pin to an edition a live build would refuse, or to one this checkout cannot check", () => {
    expect(() => checkPinSet({ rules_edition_id: bundled.editionId }, bundled)).toThrow(/battery\.numbersFrom/);
    expect(() => checkPinSet({ rules_edition_id: "byt-0000000000ab" }, bundled)).toThrow(/rules\/edition\.json/);
    expect(() => checkPinSet({ rules_edition_id: "" }, bundled)).not.toThrow();
    expect(() => checkPinSet({ kill_cloud: "true" }, bundled)).not.toThrow();
    const known = new Set([...live.facts, "battery.numbersFrom"]);
    expect(() => checkPinSet({ rules_edition_id: bundled.editionId }, bundled, known)).not.toThrow();
  });

  it("checks the pin the whole template would publish, not only the values set on the command line", async () => {
    const sha = await sha256Hex(canonicalJson(bundled));
    const template = (id: string, hash: string) => ({ parameters: {
      rules_edition_id: { defaultValue: { value: id } }, rules_edition_sha256: { defaultValue: { value: hash } } } });
    // The template already names this build's edition, which live builds refuse: published with --allow, it is refused too.
    expect(() => checkTemplatePin(template(bundled.editionId, sha), bundled, sha)).toThrow(/battery\.numbersFrom/);
    expect(() => checkTemplatePin(template("", ""), bundled, sha)).not.toThrow();
    expect(() => checkTemplatePin({ parameters: {} }, bundled, sha)).not.toThrow();
    const known = new Set([...live.facts, "battery.numbersFrom"]);
    expect(() => checkTemplatePin(template(bundled.editionId, sha), bundled, sha, known)).not.toThrow();
    // The id must be this checkout's edition, and the hash its hash.
    expect(() => checkTemplatePin(template("byt-0000000000ab", sha), bundled, sha, known)).toThrow(/rules\/edition\.json/);
    expect(() => checkTemplatePin(template(bundled.editionId, "0".repeat(64)), bundled, sha, known)).toThrow(/rules_edition_sha256/);
  });

  it("refuses a pin in a conditional value or a parameter group: clients pick each key's value on its own", async () => {
    const sha = await sha256Hex(canonicalJson(bundled));
    const conditional = { parameters: {
      rules_edition_id: { defaultValue: { value: "" }, conditionalValues: { phones: { value: bundled.editionId } } },
      rules_edition_sha256: { defaultValue: { value: "" }, conditionalValues: { phones: { value: sha } } } } };
    expect(() => checkTemplatePin(conditional, bundled, sha)).toThrow(/top-level default/);
    const grouped = { parameters: {}, parameterGroups: { pins: { parameters: {
      rules_edition_id: { defaultValue: { value: bundled.editionId } }, rules_edition_sha256: { defaultValue: { value: sha } } } } } };
    expect(() => checkTemplatePin(grouped, bundled, sha)).toThrow(/top-level default/);
    const known = new Set([...live.facts, "battery.numbersFrom"]);
    // Refused even for an edition every live build reads: a client in two conditions could get the id from one and
    // the hash from the other.
    expect(() => checkTemplatePin(conditional, bundled, sha, known)).toThrow(/top-level default/);
    const plain = { parameters: { rules_edition_id: { defaultValue: { value: bundled.editionId } }, rules_edition_sha256: { defaultValue: { value: sha } } } };
    expect(() => checkTemplatePin(plain, bundled, sha, known)).not.toThrow();
    const wrongHash = { parameters: { rules_edition_id: { defaultValue: { value: bundled.editionId } },
      rules_edition_sha256: { defaultValue: { value: sha }, conditionalValues: { phones: { value: "0".repeat(64) } } } } };
    expect(() => checkTemplatePin(wrongHash, bundled, sha, known)).toThrow(/top-level default/);
  });

  it("treats a pin as unchanged only when every value sits where it does live, and refuses a pin with empty values", async () => {
    const sha = await sha256Hex(canonicalJson(bundled));
    const at = (cond: string, id: string, hash: string) => ({ parameters: {
      rules_edition_id: { defaultValue: { value: "" }, conditionalValues: { [cond]: { value: id } } },
      rules_edition_sha256: { defaultValue: { value: "" }, conditionalValues: { [cond]: { value: hash } } } } });
    // The same old id and hash moved to another condition is a new pin, and an old edition is refused.
    expect(() => checkPublishPin(at("tablets", "byt-08f3b8c7ff31", "a".repeat(64)), at("phones", "byt-08f3b8c7ff31", "a".repeat(64)), {}, bundled, sha))
      .toThrow(/top-level default/);
    // A pin naming this edition must give its hash everywhere: an empty hash for one condition is refused.
    const known = new Set([...live.facts, "battery.numbersFrom"]);
    const gap = { parameters: { rules_edition_id: { defaultValue: { value: bundled.editionId } },
      rules_edition_sha256: { defaultValue: { value: sha }, conditionalValues: { phones: { value: "" } } } } };
    expect(() => checkTemplatePin(gap, bundled, sha, known)).toThrow(/top-level default/);
  });
});
