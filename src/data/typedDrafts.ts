// An item still being typed is kept in this tab's session storage under its box's id (src/ui/AddByHand.tsx), so a
// reload brings it back. A deleted box takes every draft with it, so the box that replaces it opens with none.
const PREFIX = "byt.draft.";

export const draftKey = (boxId: string) => `${PREFIX}${boxId}`;

export function forgetTypedDrafts(store: Pick<Storage, "length" | "key" | "removeItem">): void {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k?.startsWith(PREFIX)) keys.push(k);
  }
  for (const k of keys) store.removeItem(k);
}
