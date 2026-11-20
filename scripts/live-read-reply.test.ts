// The daily live read passes only on a model reply that is a read the app can use.
import { describe, expect, it } from "vitest";
import { readFromReply } from "./live-read-reply";

const reply = (text: unknown) => ({ candidates: [{ content: { parts: [{ text }] } }] });

describe("readFromReply", () => {
  it("takes the read from the first candidate's text", () => {
    expect(readFromReply(reply(JSON.stringify({ category: "lotion_cream", itemName: "Lotion" })))).toEqual({ category: "lotion_cream" });
  });

  it("joins a read split across parts", () => {
    const body = { candidates: [{ content: { parts: [{ text: '{"category":' }, { text: '"clothing"}' }] } }] };
    expect(readFromReply(body)).toEqual({ category: "clothing" });
  });

  it("refuses an error body, an empty reply, text that is not JSON, and a category the app does not have", () => {
    expect(() => readFromReply({ error: { code: 429, status: "RESOURCE_EXHAUSTED" } })).toThrow(/no text/);
    expect(() => readFromReply(reply(""))).toThrow(/no text/);
    expect(() => readFromReply(reply("Sorry, I cannot help with that."))).toThrow();
    expect(() => readFromReply(reply(JSON.stringify({ category: "spaceship" })))).toThrow(/not a read/);
    expect(() => readFromReply(null)).toThrow(/no text/);
  });
});
