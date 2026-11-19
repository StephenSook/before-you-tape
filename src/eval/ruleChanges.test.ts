import { describe, expect, it } from "vitest";
import { RULE_CHANGES_AFTER_LABELLING, untouchedItems } from "./ruleChanges";
import type { EvalSet } from "./types";

const set = (ids: string[]): EvalSet => ({
  setId: "s", manifestSha256: "", protocolSha256: "", destinations: ["CA"],
  items: ids.map((itemId) => ({ itemId, photo: "", photoSha256: "", hazard: false, printed: null, truth: {}, provenance: { sourcePage: "", author: "", license: "", licenseUrl: "", changes: "" } })),
});

describe("rule changes made after the set was labelled", () => {
  it("names each item that prompted one, with its commit", () => {
    expect(RULE_CHANGES_AFTER_LABELLING).toEqual([
      { itemId: "i25", commit: "dda2875", change: "chocolate and margarine count as easily liquefiable (PH-P-01)" },
      { itemId: "i20", commit: "877f673", change: "a ceramic category, Check this for the Philippines (PH-P-01)" },
    ]);
  });

  it("gives the set without those items, for the second number every report shows", () => {
    expect(untouchedItems(set(["i01", "i20", "i25", "own-18"])).items.map((i) => i.itemId)).toEqual(["i01", "own-18"]);
  });
});
