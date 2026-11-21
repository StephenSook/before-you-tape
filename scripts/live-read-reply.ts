// The read inside a generateContent reply: the first candidate's text, parsed by the app's own read parser,
// so only a complete read with every field passes. Used by the daily live read (tests/e2e/read.live.spec.ts).
import { parseItemReadWithLabel } from "../src/shared/itemRead";

export function readFromReply(body: unknown): { category: string } {
  const parts = (body as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> } | null)?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("");
  if (text.trim() === "") throw new Error("the reply has no text");
  const { read } = parseItemReadWithLabel(text);
  return { category: read.category };
}

// The live read counts only a reply from Firebase AI Logic for this project's own model call.
export const isProjectModelCall = (url: string, method: string): boolean =>
  method === "POST" && url.startsWith("https://firebasevertexai.googleapis.com/") && url.includes("/projects/before-you-tape-2026/") && url.includes(":generateContent");
