import { describe, expect, it } from "vitest";
import vectors from "../../tests/vectors/join-links.json";
import { JOIN_ORIGINS, makeJoinLink, parseJoinLink } from "./joinLink";

describe("join links", () => {
  it("round-trips a join link", () => {
    const link = makeJoinLink("https://before-you-tape-2026.web.app", "box1", "ABCDEFGHJKMNPQRSTVWXYZ2345");
    expect(link).toBe("https://before-you-tape-2026.web.app/?join=box1.ABCDEFGHJKMNPQRSTVWXYZ2345");
    expect(parseJoinLink(link)).toEqual({ boxId: "box1", key: "ABCDEFGHJKMNPQRSTVWXYZ2345" });
  });

  it("reads every shared vector the way the phone apps must", () => {
    for (const v of vectors) expect(parseJoinLink(v.link), v.name).toEqual(v.expect);
  });

  it("accepts links only from this app's own sites", () => {
    expect(JOIN_ORIGINS).toEqual(["https://before-you-tape-2026.web.app"]);
  });
});
