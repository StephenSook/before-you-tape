import { afterEach, describe, expect, it } from "vitest";
import { draftKey, forgetTypedDrafts } from "./typedDrafts";

describe("typed drafts", () => {
  afterEach(() => sessionStorage.clear());

  it("keys a draft by its box", () => {
    expect(draftKey("box-a")).toBe("byt.draft.box-a");
  });

  it("forgets every box's draft, and nothing else", () => {
    sessionStorage.setItem(draftKey("box-a"), "{}");
    sessionStorage.setItem(draftKey("box-b"), "{}");
    sessionStorage.setItem("byt.other", "keep");
    forgetTypedDrafts(sessionStorage);
    expect([sessionStorage.getItem(draftKey("box-a")), sessionStorage.getItem(draftKey("box-b")), sessionStorage.getItem("byt.other")]).toEqual([null, null, "keep"]);
  });
});
