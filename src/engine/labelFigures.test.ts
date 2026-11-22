// The shared label-figure vectors: the figures an item keeps from its labels (tests/vectors/labelFigures.json).
// The phone apps run the same file through the bridge's labelFiguresJson, so no app parses a label itself.
import { describe, expect, it } from "vitest";
import vectors from "../../tests/vectors/labelFigures.json";
import { keptLabelFigures, type LabelFigures } from "./battery";

interface FigureVector { name: string; texts: string[]; kept?: LabelFigures; expect: LabelFigures | null }

describe("keptLabelFigures", () => {
  it("gives every shared label-figure vector its figures", () => {
    for (const v of vectors as FigureVector[]) expect(keptLabelFigures(v.texts, v.kept), v.name).toEqual(v.expect);
  });
});
