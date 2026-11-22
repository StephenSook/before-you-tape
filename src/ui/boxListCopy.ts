// What the saved box list holds, said the same way wherever the app explains it. It matches what the store
// sends to Firestore (forStorage in src/data/boxStore.ts): no photo, no label text, no item name of its own; the
// label's Wh and lithium-grams figures (labelFigures) are kept as numbers.
export const BOX_LIST_SAVED =
  "Photos and label text stay on this device. Your box list is saved so it survives a reload. It holds each item's category, how many, its battery numbers, the Wh and lithium-grams figures its label names, your answers and the rule words found on its label, never the photo or the label text.";
