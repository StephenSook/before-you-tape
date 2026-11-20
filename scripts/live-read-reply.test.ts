// The daily live read passes only on a model reply that is a complete read the app can use, from this
// project's own model call.
import { describe, expect, it } from "vitest";
import type { ItemRead } from "../src/shared/itemRead";
import { isProjectModelCall, readFromReply } from "./live-read-reply";

const lotion: ItemRead = {
  itemName: "Body lotion", category: "lotion_cream", labelText: "SHEA BODY LOTION 8 FL OZ", volts: 0, milliampHours: 0, wattHours: 0,
  lithiumGrams: 0, batteryWords: false, liquid: true, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false,
  glassContainer: false, powder: false, retailBox: "cannot_tell", evidence: "label_read",
};
const reply = (text: unknown) => ({ candidates: [{ content: { parts: [{ text }] } }] });

describe("readFromReply", () => {
  it("takes a complete read from the first candidate's text", () => {
    expect(readFromReply(reply(JSON.stringify(lotion)))).toEqual({ category: "lotion_cream" });
  });

  it("joins a read split across parts", () => {
    const text = JSON.stringify(lotion);
    const body = { candidates: [{ content: { parts: [{ text: text.slice(0, 40) }, { text: text.slice(40) }] } }] };
    expect(readFromReply(body)).toEqual({ category: "lotion_cream" });
  });

  it("refuses an error body, empty text, text that is not JSON, an incomplete read and an unknown category", () => {
    expect(() => readFromReply({ error: { code: 429, status: "RESOURCE_EXHAUSTED" } })).toThrow(/no text/);
    expect(() => readFromReply(reply(""))).toThrow(/no text/);
    expect(() => readFromReply(reply("Sorry, I cannot help with that."))).toThrow(/not JSON/);
    expect(() => readFromReply(reply(JSON.stringify({ category: "clothing" })))).toThrow(/missing/);
    expect(() => readFromReply(reply(JSON.stringify({ ...lotion, category: "spaceship" })))).toThrow();
    expect(() => readFromReply(null)).toThrow(/no text/);
  });
});

describe("isProjectModelCall", () => {
  it("counts only this project's generateContent POST to Firebase AI Logic", () => {
    const url = "https://firebasevertexai.googleapis.com/v1beta/projects/before-you-tape-2026/models/gemini-3.5-flash-lite:generateContent";
    expect(isProjectModelCall(url, "POST")).toBe(true);
    expect(isProjectModelCall(url, "GET")).toBe(false);
    expect(isProjectModelCall(url.replace("before-you-tape-2026", "someone-else"), "POST")).toBe(false);
    expect(isProjectModelCall("https://evil.example/v1beta/projects/before-you-tape-2026/models/x:generateContent", "POST")).toBe(false);
  });
});
