// Every rule edition this build can ship carries a revision, and each revision names exactly one edition.
// A change to the rules changes the edition id, which fails here until a new revision is added: a pinned
// edition is used only when its revision is higher than the built-in one's.
import { describe, expect, it } from "vitest";
import edition from "../../rules/edition.json";
import revision from "../../rules/revision.json";
import history from "./revisions.json";

describe("rule edition revisions", () => {
  it("builds the edition from the revision in rules/revision.json", () => {
    expect((edition as { revision?: number }).revision).toBe(revision.revision);
  });

  it("names the current edition as the last revision, with each revision and id used once, in order", () => {
    expect(history.at(-1)).toEqual({ revision: revision.revision, editionId: edition.editionId });
    expect(new Set(history.map((h) => h.editionId)).size).toBe(history.length);
    history.forEach((h, i) => expect(h.revision, h.editionId).toBe(i + 1));
  });
});
