// Joins the committed set manifest (eval/set/manifest.json: photos, hashes, provenance) and its labels
// (eval/set/labels.json) into the EvalSet the metrics read. The hazard flag comes from the labels only:
// an item is a hazard item when its label is not "OK to pack" for at least one destination.
import type { EvalItem, EvalSet, Level, Provenance } from "./types";

export interface SetManifestItem {
  itemId: string;
  photo: string;
  photoSha256: string;
  photoSha256Original: string;
  widthPx: number;
  heightPx: number;
  alt: string;
  printed: EvalItem["printed"];
  provenance: Provenance;
}

export interface SetManifest {
  setId: string;
  destinations: { code: string; name: string }[];
  publishing: { maxSide: number; jpegQuality: number };
  protocolSha256: string;
  labelsSha256: string;
  items: SetManifestItem[];
}

export interface LabelRow { expected: Level; section: string; evidence?: string; note?: string }
// typed: each item's category as a person would type it from the photo, for the rules-only baseline. It is
// recorded with the labels, before the freeze.
export interface SetLabels { setId: string; status: string; items: Record<string, Record<string, LabelRow>>; typed?: Record<string, { category: string }> }

export function buildEvalSet(manifest: SetManifest, labels: SetLabels): EvalSet {
  if (labels.setId !== manifest.setId) throw new Error(`labels are for set "${labels.setId}", not "${manifest.setId}"`);
  const items = manifest.items.map((m): EvalItem => {
    const rows = labels.items[m.itemId];
    if (!rows) throw new Error(`${m.itemId} has no labels`);
    const truth = Object.fromEntries(Object.entries(rows).map(([d, r]) => [d, { expected: r.expected, section: r.section }]));
    return {
      itemId: m.itemId, photo: m.photo, photoSha256: m.photoSha256, printed: m.printed, provenance: m.provenance,
      hazard: Object.values(truth).some((r) => r.expected !== "ok"), truth,
    };
  });
  return { setId: manifest.setId, manifestSha256: "", protocolSha256: manifest.protocolSha256, destinations: manifest.destinations.map((d) => d.code), items };
}
