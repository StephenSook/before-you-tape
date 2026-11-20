// The read inside a generateContent reply: the first candidate's text, which must be the JSON read with a
// category the app knows. Used by the daily live read (tests/e2e/read.live.spec.ts), which passes on nothing else.
import { ITEM_CATEGORIES } from "../src/shared/itemRead";

export function readFromReply(body: unknown): { category: string } {
  const parts = (body as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> } | null)?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("");
  if (text.trim() === "") throw new Error("the reply has no text");
  const read = JSON.parse(text) as { category?: unknown } | null;
  if (typeof read?.category !== "string" || !(ITEM_CATEGORIES as readonly string[]).includes(read.category)) {
    throw new Error(`the reply is not a read: category ${JSON.stringify(read?.category)}`);
  }
  return { category: read.category };
}
