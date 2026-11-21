// A reason that starts with the item's own question only restates it, and every card asks that question just
// below its reasons, so the cards leave such a reason out. The Android card follows the same rule.
export function restatesQuestion(text: string, question: { text: string } | null | undefined): boolean {
  return !!question && text.startsWith(question.text);
}
